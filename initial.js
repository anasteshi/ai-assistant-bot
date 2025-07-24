require("dotenv").config()

const {Telegraf} = require("telegraf")
const bot = new Telegraf(process.env.BOT_TOKEN)

const {GoogleGenAI, Modality} = require("@google/genai")
const axios = require("axios")
const api_key = process.env.BOT_AI_ASSISTANT_TOKEN

class AsyncQueue {
	#queue = []
	#waiting = []

	put(item) {
		if (this.#waiting.length > 0) {
			const resolve = this.#waiting.shift()
			if (resolve) {
				resolve(item)
			}
		} else {
			this.#queue.push(item)
		}
	}

	get() {
		return new Promise((resolve) => {
			if (this.#queue.length > 0) {
				resolve(this.#queue.shift())
			} else {
				this.#waiting.push(resolve)
			}
		})
	}

	clear() {
		this.#queue = []
		this.#waiting = []
	}
}

bot.start((ctx) => {
	ctx.reply(
		"Привет! Я AI-ассистент. Чтобы задать мне вопрос, используй команду /assistant, например:\n\n/assistant сколько лет планете Земля?"
	)
})

bot.command("assistant", async (ctx) => {
	const messageToEdit = await ctx.reply("⏳ Генерирую ответ...")
	async function live(client, model) {
		const responseQueue = new AsyncQueue()

		async function handleTurn() {
			const turn = []
			let fullResponseText = ""

			while (true) {
				const message = await responseQueue.get()
				const text = message.serverContent?.modelTurn?.parts?.[0]?.text
				// const inlineData =
				// 	message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data

				if (text) {
					fullResponseText += text
					await ctx.telegram
						.editMessageText(
							ctx.chat.id,
							messageToEdit.message_id,
							null,
							fullResponseText,
							{parse_mode: "Markdown"}
						)
						.catch(console.log)
				}
				// if (inlineData) {
				// 	fullResponseText += text
				// 	await ctx.telegram
				// 		.editMessageText(
				// 			ctx.chat.id,
				// 			messageToEdit.message_id,
				// 			null,
				// 			fullResponseText,
				// 			{parse_mode: "Markdown"}
				// 		)
				// 		.catch(console.log)
				// }

				turn.push(message)
				if (message.serverContent?.turnComplete) {
					return turn
				}
			}
		}

		const session = await client.live.connect({
			model: model,
			callbacks: {
				onopen: () => {
					console.debug("Opened")
				},
				onmessage: (message) => {
					responseQueue.put(message)
				},
				onerror: (e) => {
					console.debug("Error:", e.message)
				},
				onclose: (e) => {
					console.debug("Close:", e.reason)
					responseQueue.clear()
				},
			},
			config: {responseModalities: [Modality.TEXT]},
		})

		ctx.session.history = []
		const userTurn = []
		let simple
		if (ctx.message.text) {
			userTurn.push(ctx.message.text)
			ctx.session.history.push({role: "user", parts: userTurn})
			simple = ctx.session.history
		}
		await session.sendClientContent({turns: simple})

		await handleTurn()

		session.close()
	}

	async function main() {
		const model = "models/gemini-2.0-flash-live-001"
		let client = new GoogleGenAI({
			vertexai: false,
			apiKey: api_key,
		})

		await live(client, model).catch((e) => console.error("got error", e))
	}

	main()
})

bot.launch()
console.log("Бот запущен...")

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
