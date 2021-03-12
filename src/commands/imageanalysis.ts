import { Message } from 'discord.js';

import { analyzeImage, getVoyParams } from '../utils/imageanalysis';
import { calculateBehold, isValidBehold } from '../utils/beholdcalc';
import { voyCalc, formatVoyageReply } from '../utils/voyage';
import { sendAndCache } from '../utils/discord';

import { Logger } from '../utils';

export async function runImageAnalysis(locale: Definitions.Locale, message: Message, url: string, usedPrefix: string) {
	let data = await analyzeImage(url);
	if (data) {
		Logger.info(`Image analysis`, {
			id: message.id,
			author: { id: message.author.id, username: message.author.username },
			guild: message.guild ? message.guild.toString() : 'DM',
			channel: message.channel.toString(),
			analysisResult: data,
		});

		// Might be something usable in here
		if (data.voyResult && data.voyResult.valid) {
			let params = getVoyParams(data.voyResult);
			let results = voyCalc(params[0], params[1], params[2], params[3], params[4], params[5], data.voyResult.antimatter);

			sendAndCache(
				message,
				`${formatVoyageReply(
					message,
					results
				)}\nIf I got the numbers wrong, fix them and rerun the command with \`${usedPrefix} voytime ${params.join(' ')} ${
					data.voyResult.antimatter
				}\``
			);
		} else if (data.beholdResult && isValidBehold(data.beholdResult, 10)) {
			await calculateBehold(locale, message, data.beholdResult, false, false);
		}
	}
}
