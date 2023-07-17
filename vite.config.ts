import { defineConfig } from "vite"
import { resolve } from "node:path"
import dts from "vite-plugin-dts"

const packageName = "admixture"

const fileName = {
	es: `${packageName}.mjs`,
	cjs: `${packageName}.cjs`,
	iife: `${packageName}.iife.js`,
}

export default defineConfig({
	plugins: [dts()],
	base: "./",
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			name: packageName,
			formats: ["cjs", "es", "iife"],
			fileName: (format) => fileName[format],
		},
	},
	test: {
		include: ["tests/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
		globals: true,
		environment: "happy-dom",
		setupFiles: "./testing-setup.ts",
	},
})
