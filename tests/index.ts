import { describe, test, expect, vi } from "vitest"
import {
	Children,
	Cleanup,
	Computed,
	ForKeys,
	ForPairs,
	ForValues,
	Hydrate,
	New,
	Observer,
	Parent,
	Ref,
	Value,
	peek,
} from "../src"

describe("peek", () => {
	test("it correctly returns a state object's value", () => {
		const value = new Value("Value")

		expect(peek(value)).toBe(value["value"])
	})
})

describe("value", () => {
	test("it has the correct value", () => {
		const value = new Value("Value")

		expect(value["value"]).toBe("Value")
	})

	test("it correctly updates", () => {
		const value = new Value("Value")

		expect(value["value"]).toBe("Value")

		const noop = vi.fn()

		value["emitter"].on("changed", noop)

		value.set("NewValue")

		expect(noop).toHaveBeenCalledOnce()
		expect(value["value"]).toBe("NewValue")
	})
})

describe("computed", () => {
	test("it has the correct value", () => {
		const computed = new Computed(() => {
			return "Computed"
		})

		expect(computed["value"]).toBe("Computed")
	})

	test("it correctly updates", () => {
		const value = new Value("Value")
		const computed = new Computed((use) => {
			return use(value)
		})

		expect(computed["value"]).toBe("Value")

		const noop = vi.fn()

		computed["emitter"].on("changed", noop)

		value.set("NewValue")

		expect(noop).toHaveBeenCalledOnce()
		expect(computed["value"]).toBe("NewValue")
	})

	test("it errors when a computed `use`s itself", () => {
		expect(() => {
			let computed: Computed<any>
			const updater = new Value(false)

			computed = new Computed((use) => {
				use(updater)
				return computed && use(computed)
			})

			updater.set(true)
		}).toThrow("A state object may not `use` itself!")
	})

	test("it errors with a circular dependency", () => {
		expect(() => {
			let computedA: Computed<any>
			let computedB: Computed<any>
			const updater = new Value(false)

			computedA = new Computed((use) => {
				use(updater)
				return computedB && use(computedB)
			})

			computedB = new Computed((use) => {
				use(updater)
				return computedA && use(computedA)
			})

			updater.set(true)
		}).toThrow("Circular dependency detected!")
	})
})

describe("observer", () => {
	test("it updates with a state object", () => {
		const callback = vi.fn()
		const value = new Value("Value")
		const disconnect = new Observer(value).onChange(callback)

		expect(callback).not.toHaveBeenCalled()

		value.set("NewValue")

		expect(callback).toHaveBeenCalledOnce()

		disconnect()

		value.set("NewerValue")

		expect(callback).toHaveBeenCalledOnce()
	})
})

describe("forkeys", () => {
	test("it has the correct value", () => {
		const object = {
			red: 1,
			2: "blue",
			[Symbol.for("green")]: 3,
		} as const

		const newObject = ForKeys(object, (_use, key) => {
			return `${String(typeof key === "symbol" ? key.description : key)}New`
		})

		expect(newObject["value"]).toStrictEqual({
			redNew: 1,
			["2New"]: "blue",
			["greenNew"]: 3,
		})
	})

	test("it correctly updates", () => {
		const object = new Value({
			red: 1,
		})

		const newObject = ForKeys(object, (_use, key) => {
			return `${key}New`
		})

		expect(newObject["value"]).toStrictEqual({
			redNew: 1,
		})

		object.set({
			red: 2,
		})

		expect(newObject["value"]).toStrictEqual({
			redNew: 2,
		})
	})
})

describe("forvalues", () => {
	test("it has the correct value", () => {
		const object = {
			red: 1,
			2: "blue",
			[Symbol.for("green")]: 3,
		} as const

		const newObject = ForValues(object, (_use, value) => {
			return `${value}New`
		})

		expect(newObject["value"]).toStrictEqual({
			red: "1New",
			2: "blueNew",
			[Symbol.for("green")]: "3New",
		})
	})

	test("it correctly updates", () => {
		const object = new Value({
			red: 1,
		})

		const newObject = ForValues(object, (_use, value) => {
			return value * 2
		})

		expect(newObject["value"]).toStrictEqual({
			red: 2,
		})

		object.set({
			red: 2,
		})

		expect(newObject["value"]).toStrictEqual({
			red: 4,
		})
	})
})

describe("forpairs", () => {
	test("it has the correct value", () => {
		const object = {
			red: 1,
			2: "blue",
			[Symbol.for("green")]: 3,
		} as const

		const newObject = ForPairs(object, (_use, key, value) => {
			return [
				`${String(typeof key === "symbol" ? key.description : key)}New`,
				`${value}New`,
			]
		})

		expect(newObject["value"]).toStrictEqual({
			redNew: "1New",
			["2New"]: "blueNew",
			["greenNew"]: "3New",
		})
	})

	test("it correctly updates", () => {
		const object = new Value({
			red: 1,
		})

		const newObject = ForPairs(object, (_use, key, value) => {
			return [`${key}New`, value * 2]
		})

		expect(newObject["value"]).toStrictEqual({
			redNew: 2,
		})

		object.set({
			red: 2,
		})

		expect(newObject["value"]).toStrictEqual({
			redNew: 4,
		})
	})
})

describe("hydrate", () => {
	test("it correctly changes an element", () => {
		const element = document.createElement("div")

		Hydrate(element, {
			ariaLabel: "test",
		})

		expect(element.ariaLabel).toBe("test")
	})

	test("it correctly sets a ref's value", () => {
		const ref = new Value<HTMLDivElement | undefined>(undefined)

		const element = New("div", {
			[Ref]: ref,
		})

		expect(ref["value"]).toBe(element)
	})

	test("it correctly cleans up", () => {
		const noop = vi.fn()

		const element = New("div", {
			[Cleanup]: noop,
		})

		document.body.append(element)

		element.remove()

		expect(noop).toHaveBeenCalledOnce()
	})

	test("it correctly parents a node tree", () => {
		const h1 = New("h1", {})
		const p = new Value(New("p", {}))
		const tree = New("div", {
			[Children]: [h1, p],
		})

		expect(tree).toContainElement(h1)
		expect(tree).toContainElement(p["_value"])
		expect(document.body).not.toContainElement(tree)

		Hydrate(tree, {
			[Parent]: document.body,
		})

		expect(document.body).toContainElement(tree)
	})

	test("it works with arrays and objects", () => {
		const array = [1, 2]

		const object = {
			red: 1,
			blue: 2,
		}

		const newArray = ForValues(array, (use, number) =>
			New("p", { textContent: String(number) })
		)

		const newObject = ForPairs(object, (use, key, number) => [
			key,
			New("h1", { textContent: key }),
		])

		const tree = New("div", {
			[Children]: [newArray, newObject],
		})

		for (const element of newArray["_value"]) {
			expect(tree).toContainElement(element)
		}

		for (const element of Object.values(newObject["_value"])) {
			expect(tree).toContainElement(element)
		}
	})

	test("it supports state properties", () => {
		const text = new Value("Value")

		const element = New("p", {
			textContent: text,
		})

		expect(element).toHaveTextContent("Value")

		text.set("NewValue")

		expect(element).toHaveTextContent("NewValue")
	})
})
