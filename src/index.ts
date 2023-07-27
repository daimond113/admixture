import EventEmitter from "mitt"

type CanBeState<T> = T | StateObject<T>
type ReadState = <T>(state: CanBeState<T>) => T
type StateObjectCallback<Returns, U extends any[] = []> = (
	use: ReadState,
	...args: U
) => Returns
type OnEventName<T extends keyof HTMLElementEventMap> =
	`${typeof OnEventPrefix}${T}`

type HydrateOptions<T extends HTMLElement> = {
	[K in keyof T as T[K] extends Readonly<any>
		? never
		: K]?: T[K] extends Function ? never : CanBeState<T[K]>
} & {
	[Children]?: CanBeState<
		CanBeState<Record<PropertyKey, Node> | Node | Node[]>[]
	>
	[Ref]?: Value<T | undefined>
	[Cleanup]?: () => void
	[Parent]?: Node
} & {
	[K in OnEventName<keyof HTMLElementEventMap>]?: K extends OnEventName<
		infer EventName extends keyof HTMLElementEventMap
	>
		? (event: HTMLElementEventMap[EventName]) => void
		: never
}

export const Children = Symbol("Children")
export const Ref = Symbol("Ref")
export const CreateElementOptions = Symbol("CreateElementOptions")
export const Cleanup = Symbol("Cleanup")
export const Parent = Symbol("Parent")

const OnEventPrefix = "____AdmixtureOnEvent" as const

export function OnEvent<const T extends keyof HTMLElementEventMap>(
	event: T
): OnEventName<T> {
	return `${OnEventPrefix}${event}`
}

export const peek: ReadState = (state) =>
	state instanceof StateObject ? state["value"] : state

function _use<T>(this: StateObject<T>, state: CanBeState<any>) {
	if (!(state instanceof StateObject)) return state
	if (this === state) throw new Error("A state object may not `use` itself!")

	const dependencies = this["dependencies"]

	if (!dependencies.has(state)) {
		const callback = this["callback"]
		if (!callback)
			throw new Error(
				"Function `use` called on a state object without a callback!"
			)

		if (state["dependencies"].has(this))
			throw new Error("Circular dependency detected!")

		const handler = () => {
			this["value"] = callback(_use.bind(this))
		}
		const emitter = state["emitter"]
		emitter.on("changed", handler)
		dependencies.add(state)
		emitter.on("destroyed", () => {
			emitter.off("changed", handler)
			dependencies.delete(state)
		})
	}

	return peek(state)
}

abstract class StateObject<T> {
	private emitter = EventEmitter<{ changed: void; destroyed: void }>()
	private dependencies = new Set<StateObject<any>>()
	protected _value: T
	protected callback?: StateObjectCallback<T>

	protected get value() {
		return this._value
	}

	protected set value(newValue: T) {
		this._value = newValue
		this.emitter.emit("changed")
	}

	protected destroy() {
		this.emitter.emit("destroyed")
		this.dependencies.clear()
	}
}

export class Value<T> extends StateObject<T> {
	constructor(protected _value: T) {
		super()
	}

	set(newValue: T) {
		this.value = newValue
	}
}

export class Computed<T> extends StateObject<T> {
	constructor(protected callback: StateObjectCallback<T>) {
		super()
		this._value = callback(_use.bind(this))
	}
}

export class Observer<T> {
	constructor(private state: StateObject<T>) {}

	onChange(callback: () => void) {
		this.state["emitter"].on("changed", callback)

		return () => {
			this.state["emitter"].off("changed", callback)
		}
	}
}

// TODO: Possibly array support
export function ForKeys<
	NewKey extends PropertyKey,
	T extends Record<PropertyKey, any>
>(
	object: CanBeState<T>,
	mapper: StateObjectCallback<NewKey, [keyof T]>
): Computed<Record<NewKey, T[keyof T]>> {
	return new Computed((use) => {
		const resolvedObject = use(object)
		const newObject = {} as Record<NewKey, T[keyof T]>

		// TODO: Decide if we want to iterate over symbols
		for (const key of Reflect.ownKeys(resolvedObject)) {
			const mappedKey = mapper(use, key as keyof T)
			newObject[mappedKey] = resolvedObject[key]
		}

		return newObject
	})
}

export function ForValues<
	NewValue extends any,
	T extends Record<PropertyKey, any> | any[]
>(
	object: CanBeState<T>,
	mapper: StateObjectCallback<NewValue, [T[keyof T]]>
): Computed<T extends any[] ? NewValue[] : Record<keyof T, NewValue>> {
	return new Computed((use) => {
		const resolvedObject = use(object)
		const newObject = (
			Array.isArray(resolvedObject) ? [] : {}
		) as T extends any[] ? NewValue[] : Record<keyof T, NewValue>

		if (Array.isArray(resolvedObject)) {
			for (const [key, value] of resolvedObject.entries()) {
				newObject[key] = mapper(use, value)
			}
		} else {
			// TODO: Decide if we want to iterate over symbols
			for (const key of Reflect.ownKeys(resolvedObject)) {
				// @ts-ignore
				newObject[key as keyof T] = mapper(use, resolvedObject[key])
			}
		}

		return newObject
	})
}

// TODO: Possibly array support
export function ForPairs<
	NewKey extends PropertyKey,
	NewValue extends any,
	T extends Record<PropertyKey, any>
>(
	object: CanBeState<T>,
	mapper: StateObjectCallback<[NewKey, NewValue], [keyof T, T[keyof T]]>
): Computed<Record<NewKey, NewValue>> {
	return new Computed((use) => {
		const resolvedObject = use(object)
		const newObject = {} as Record<NewKey, NewValue>

		// TODO: Decide if we want to iterate over symbols
		for (const key of Reflect.ownKeys(resolvedObject)) {
			const [newKey, newValue] = mapper(use, key, resolvedObject[key])
			newObject[newKey] = newValue
		}

		return newObject
	})
}

// TODO: Should this be a WeakMap?
const DeletionCallbacks = new Map<Node, () => void>()
const DeletionObserver = new MutationObserver((changes) => {
	for (const change of changes) {
		change.removedNodes.forEach((node) => {
			DeletionCallbacks.get(node)?.()
			DeletionCallbacks.delete(node)
		})
	}
})

DeletionObserver.observe(document.body, {
	childList: true,
	subtree: true,
})

export function Hydrate<const T extends HTMLElement>(
	element: T,
	options: HydrateOptions<T>
): T {
	const eventListeners = new Map<
		keyof HTMLElementEventMap,
		Set<(event: Event) => void>
	>()

	new Computed((use) => {
		for (const option of Object.keys(options)) {
			const value = options[option as keyof typeof options]

			if (typeof option === "string" && option.startsWith(OnEventPrefix)) {
				const eventName = option.replace(
					OnEventPrefix,
					""
				) as keyof HTMLElementEventMap
				let registeredEventListeners = eventListeners.get(eventName)
				if (!registeredEventListeners) {
					registeredEventListeners = new Set()
					eventListeners.set(eventName, registeredEventListeners)
				}

				if (registeredEventListeners.has(value as () => void)) continue

				element.addEventListener(eventName, value as () => void)
				registeredEventListeners.add(value as () => void)

				continue
			}

			// @ts-ignore
			element[option] = use(value)
		}

		const children = options[Children]
		if (children) {
			const resolvedChildren = use(children)

			for (const child of resolvedChildren) {
				const resolvedChild = use(child)

				if (resolvedChild instanceof Node) {
					element.append(resolvedChild)
				} else if (Array.isArray(resolvedChild)) {
					for (const node of resolvedChild) {
						element.appendChild(node)
					}
				} else if (typeof resolvedChild === "object") {
					for (const node of Object.values(resolvedChild)) {
						element.appendChild(node)
					}
				} else {
					throw new TypeError(
						`Unsupported child of type ${typeof resolvedChild}`
					)
				}
			}
		}
	})

	options[Ref]?.set(element)
	options[Parent]?.appendChild(element)

	const cleanup = options[Cleanup]

	if (cleanup) DeletionCallbacks.set(element, cleanup)

	return element
}

export function New<const T extends keyof HTMLElementTagNameMap>(
	tag: T,
	options: HydrateOptions<HTMLElementTagNameMap[T]> & {
		[CreateElementOptions]?: ElementCreationOptions
	}
): HTMLElementTagNameMap[T] {
	const element = document.createElement(tag, options[CreateElementOptions])

	return Hydrate(element, options)
}
