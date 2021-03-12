import fs from 'fs';
import path from 'path';
import data from './lang.json';

interface TranslationEntry {
	en: string;
	de?: string;
	sp?: string;
	fr?: string;
}

type TranslationTable = { [index: string]: TranslationEntry };

interface TranslationDataEntry {
	trait_names: any;
	ship_trait_names: any;
	crew_archetypes: {
		symbol: string;
		name: string;
		short_name: string;
	}[];
	ship_archetypes: {
		symbol: string;
		name: string;
		flavor: string;
		actions: {
			symbol: string;
			name: string;
		}[];
	}[];
}

type TranslationData = { [index: string]: TranslationDataEntry };

class TranslateClass {
	private _data: TranslationTable;
	private _translations: TranslationData;

	constructor() {
		this._data = data;

		this._translations = {};
	}

	public setup(datacore_path: string): void {
		// TODO: do we need to watch these for changes (similar to DCData)?
		this._translations['en'] = JSON.parse(fs.readFileSync(path.join(datacore_path, 'translation_en.json'), 'utf8'));
		this._translations['de'] = JSON.parse(fs.readFileSync(path.join(datacore_path, 'translation_de.json'), 'utf8'));
		this._translations['sp'] = JSON.parse(fs.readFileSync(path.join(datacore_path, 'translation_sp.json'), 'utf8'));
		this._translations['fr'] = JSON.parse(fs.readFileSync(path.join(datacore_path, 'translation_fr.json'), 'utf8'));
	}

	public get(locale: Definitions.Locale, responseKey: string, data?: any) {
		const responseTemplate = this._data[responseKey][locale];

		if (!responseTemplate) {
            // TODO: after we test everything, switch to throwing instead of default returns
			//throw new Error(`Couldn't find key "${responseKey}" in the translation table.`);
            return responseKey;
		}

        return responseTemplate.replace(/#{(.*?)}#/g, (m, i) => {
			if (!data[i]) {
				throw new Error(`There is no data property for placeholder "${i}" to inject.`);
			}

			return data[i];
		});
	}

	public localizeCrew(locale: Definitions.Locale, crew: Definitions.BotCrew) {
		let found = this._translations[locale].crew_archetypes.find(c => c.symbol === crew.symbol);
		if (found) {
			return found.name;
		} else {
			// TODO: warning for missing localized crew name?
			return crew.name;
		}
	}

	public localizeCrewTrait(locale: Definitions.Locale, trait: string) {
		let found = this._translations[locale].trait_names[trait];
		if (found) {
			return found;
		} else {
			// TODO: warning for missing localized trait name?
			return trait;
		}
	}
}

export let Translate = new TranslateClass();
