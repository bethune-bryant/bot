import data from './lang.json';

interface TranslationEntry {
	en: string;
	de?: string;
	sp?: string;
	fr?: string;
}

type TranslationTable = { [index: string]: TranslationEntry };

class TranslateClass {
	private _data: TranslationTable;

	constructor() {
		this._data = data;
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
}

export let Translate = new TranslateClass();
