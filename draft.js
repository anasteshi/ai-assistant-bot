// bot.command("reset", (ctx) => {
//     if (ctx.session && ctx.session.aiSession && !ctx.session.aiSession.isClosed) {
//         ctx.session.aiSession.close();
//     }
//     if (ctx.session && ctx.session.closeTimer) {
//         clearTimeout(ctx.session.closeTimer);
//     }
//     ctx.session = {};
//     ctx.reply("Контекст диалога сброшен.");
// });

// if (ctx.session.closeTimer) {
// 	clearTimeout(ctx.session.closeTimer)
// }
// ctx.session.closeTimer = setTimeout(() => {
// 	if (aiSession && !aiSession.isClosed) {
// 		aiSession.close()
// 		ctx.session.aiSession = null
// 		console.log(`Сессия для чата ${ctx.chat.id} закрыта по тайм-ауту.`)
// 		ctx.reply("Сессия диалога завершена из-за неактивности.")
// 	}
// }, 300000)
