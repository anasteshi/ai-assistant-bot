require("dotenv").config()

const {Telegraf} = require("telegraf")
const {GoogleGenAI, Modality} = require("@google/genai")
const {ASSISTANT_KEY, BOT_TOKEN} = process.env

const ai = new GoogleGenAI({apiKey: ASSISTANT_KEY})
// const model = "gemini-2.0-flash"
const model = "gemini-live-2.5-flash-preview"
const chat = ai.chats.create({
	model,
	config: {
		temperature: 0.5,
		maxOutputTokens: 64,
	},
})
let session
let currentResolve
let chunks = []
const bot = new Telegraf(BOT_TOKEN)

main()

async function main() {
	await connect()

	bot.on("message", async (ctx) => {
		const answer = await liveMessage(ctx.message.text)
		ctx.reply(answer, {parse_mode: "Markdown"}).catch((err) => {
			console.log("Error sending message:", err)
			ctx.reply(answer)
		})
	})

	bot.launch()
}

function connect() {
	return ai.live
		.connect({
			model,
			callbacks: {
				onopen: () => {
					console.log("Connected to the socket.")
				},
				onmessage: ({text}) => {
					if (text) {
						chunks.push(text)
					} else if (chunks.length) {
						currentResolve?.(chunks.join(""))
						chunks = []
					}
				},
				onerror: (e) => {
					console.log("Error occurred: %s\n", e.error)
				},
				onclose: (e) => {
					console.log("Connection closed.", e)
				},
			},
			config: {
				responseModalities: [Modality.TEXT],
				requestModalities: [Modality.TEXT],
			},
		})
		.then((s) => (session = s))
		.catch(console.error)
}

async function loneMessage(prompt) {
	const response = await ai.models.generateContent({
		model,
		contents: prompt,
	})
	return response.text
}

async function chatMessage(prompt) {
	const response = await chat.sendMessage({message: prompt})
	return response.text
}

async function liveMessage(prompt) {
	if (currentResolve) {
		return console.error("Busy")
	}

	session?.sendClientContent({turns: [{role: "user", parts: [{text: prompt}]}]})

	return new Promise((resolve) => {
		currentResolve = (value) => {
			resolve(value)
			currentResolve = null
		}
	})
}
