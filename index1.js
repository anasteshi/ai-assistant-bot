require("dotenv").config()

const {Telegraf, session} = require("telegraf")
const {GoogleGenAI, Modality} = require("@google/genai")
const axios = require("axios")

const bot = new Telegraf(process.env.BOT_TOKEN)
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

bot.use(session())

bot.start((ctx) => {
	ctx.reply(
		"Привет! Я AI-ассистент. Чтобы задать мне вопрос, используй команду /assistant, например:\n\n/assistant сколько лет планете Земля?"
	)
})

bot.on("message", async (ctx) => {
	const text = ctx.message.text || ctx.message.caption || ""
	console.log(ctx.session)

	if (text.startsWith("/assistant")) {
		if (ctx.session === undefined || ctx.session === null) {
			ctx.session = {}
		}
		main(ctx)
	}
})

async function live(ctx, responseQueue) {
	const messageToEdit = await ctx.reply("⏳ Генерирую ответ...")
	const question = (ctx.message.text || ctx.message.caption || "")
		.replace("/assistant", "")
		.trim()
	const photo = ctx.message.photo

	if (!question && !photo) {
		await ctx.telegram.editMessageText(
			ctx.chat.id,
			messageToEdit.message_id,
			null,
			"Пожалуйста, задайте вопрос после команды."
		)
		return
	}

	async function handleTurn() {
		let fullResponseText = ""

		while (true) {
			const message = await responseQueue.get()
			const text = message.serverContent?.modelTurn?.parts?.[0]?.text

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
					.catch(() => {})
			}

			if (message.serverContent?.turnComplete) {
				ctx.session.history.push({
					role: "model",
					parts: [{text: fullResponseText}],
				})
				return
			}
		}
	}

	// New
	const userParts = []

	if (question) {
		userParts.push({text: question})
	}

	if (photo) {
		try {
			const fileId = photo[photo.length - 1].file_id
			const fileLink = await ctx.telegram.getFileLink(fileId)

			const response = await axios.get(fileLink.href, {
				responseType: "arraybuffer",
			})
			const imageBase64 = Buffer.from(response.data, "binary").toString(
				"base64"
			)

			userParts.push({
				inlineData: {
					mimeType: "image/jpeg", 
					data: imageBase64,
				},
			})
		} catch (e) {
			console.error("Ошибка обработки фото:", e)
			await ctx.telegram.editMessageText(
				ctx.chat.id,
				messageToEdit.message_id,
				null,
				"Не удалось обработать приложенное изображение. Попробуйте еще раз."
			)
			return
		}
	}

	ctx.session.history.push({role: "user", parts: userParts})

	await ctx.session.aiSession.sendClientContent({turns: ctx.session.history})
	await handleTurn()
}

async function main(ctx) {
	const model = "models/gemini-live-2.5-flash-preview"
	const client = new GoogleGenAI({
		vertexai: false,
		apiKey: api_key,
	})

	if (!ctx.session.aiSession || ctx.session.aiSession.isClosed) {
		console.log(`Создание новой сессии для чата`)

		try {
			ctx.session.aiQueue = new AsyncQueue()
			ctx.session.aiSession = await client.live.connect({
				model: model,
				callbacks: {
					onmessage: (message) => ctx.session.aiQueue.put(message),
					onerror: (e) => console.error("Ошибка сессии AI:", e.message),
				},
				config: {responseModalities: [Modality.TEXT]},
				requestModalities: [Modality.TEXT, Modality.IMAGE],
			})
			ctx.session.history = []
		} catch (e) {
			console.error("Не удалось создать сессию с AI:", e)
			return
		}
	}

	await live(ctx, ctx.session.aiSession).catch((e) => {
		console.error("Произошла критическая ошибка в функции live:", e)
	})
}

bot.launch()
console.log("Бот запущен...")

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
