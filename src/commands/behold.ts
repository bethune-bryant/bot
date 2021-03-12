import { Message } from 'discord.js';
import yargs from 'yargs';

import { calculateBehold, isValidBehold } from '../utils/beholdcalc';
import { analyzeImage } from '../utils/imageanalysis';
import { sendAndCache } from '../utils/discord';

import { Logger } from '../utils';

import { Translate } from '../utils/translate';

async function asyncHandler(message: Message, url: string, threshold: number, base: boolean, locale: Definitions.Locale) {
	let data = await analyzeImage(url);
	if (data) {
		Logger.info(`Behold command`, {
			id: message.id,
			analysisResult: data
		});
		if (data.beholdResult && isValidBehold(data.beholdResult, threshold)) {
			await calculateBehold(locale, message, data.beholdResult, true, base);
		} else {
			sendAndCache(message, Translate.get(locale, 'BEHOLD_INVALID', { error: data.beholdResult!.error || '' }));
		}
	} else {
		sendAndCache(message, Translate.get(locale, 'BEHOLD_INVALID_URL', { url }));
	}
}

class Behold implements Definitions.Command {
	name = 'behold';
	command = 'behold <url>';
	aliases = [];
	describe = 'Analyzes a behold screenshot and returns crew details if identified';
	builder(yp: yargs.Argv): yargs.Argv {
		return yp
			.positional('url', {
				describe: 'address of a png or jpg image'
			})
			.option('threshold', {
				alias: 't',
				desc: 'lower the threshold for crew detection; the lower it is, the higher the chance for false positives',
				default: 10,
				type: 'number'
			})
			.option('base', {
				alias: 'b',
				desc: 'ignore user profile if available',
				type: 'boolean'
			});
	}

	handler(args: yargs.Arguments) {
		let message = <Message>args.message;
		let url = <string>args.url;
		let threshold = <number>args.threshold;
		let locale = args.locale ? (args.locale as Definitions.Locale) : 'en';

		args.promisedResult = asyncHandler(message, url, threshold, args.base ? (args.base as boolean) : false, locale);
	}
}

export let BeholdCommand = new Behold();
