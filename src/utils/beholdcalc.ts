import { Message, RichEmbed } from 'discord.js';

import { DCData } from '../data/DCData';
import { formatStatLine, formatCrewCoolRanks, colorFromRarity } from './crew';
import { loadProfile, loadProfileRoster, userFromMessage, applyCrewBuffs } from './profile';
import { sendAndCache } from './discord';
import CONFIG from './config';
import { Translate } from './translate';

export function isValidBehold(data: any, threshold: number = 10) {
	if (!data.top || (data.top.symbol != 'behold_title' && threshold > 1) || data.top.score < threshold) {
		return false;
	}

	if (!data.crew1 || data.crew1.score < threshold) {
		return false;
	}

	if (!data.crew2 || data.crew2.score < threshold) {
		return false;
	}

	if (!data.crew3 || data.crew3.score < threshold) {
		return false;
	}

	if (data.error) {
		return false;
	}

	if (data.closebuttons > 0) {
		// If we found something that looks like a close button, but other heuristics rank high, ignore it
		if ((data.crew1.score + data.crew2.score + data.crew3.score + data.top.score) / 4 < threshold * 3.5) {
			return false;
		}
	}

	return true;
}

export function formatCrewField(locale: Definitions.Locale, message: Message, crew: Definitions.BotCrew, stars: number, custom: string) {

	let entries: string[] = [];
	if (crew.bigbook_tier) {
		entries.push(Translate.get(locale, 'CREWFIELD_BIGBOOK', { tier: crew.bigbook_tier }));
	}

	entries.push(Translate.get(locale, 'CREWFIELD_VOYAGE', { rank: crew.ranks.voyRank }));
	entries.push(Translate.get(locale, 'CREWFIELD_GAUNTLET', { rank: crew.ranks.gauntletRank }));
	entries.push(Translate.get(locale, (crew.events !== 1) ? 'CREWFIELD_EVENTS_PLURAL' : 'CREWFIELD_EVENTS_SINGULAR', { events: crew.events }));
	entries.push(Translate.get(locale, (crew.collections.length !== 1) ? 'CREWFIELD_COLLECTIONS_PLURAL' : 'CREWFIELD_COLLECTIONS_SINGULAR', { collections: crew.collections.length }));

	let reply = entries.join(', ');

	let coolRanks = formatCrewCoolRanks(locale, crew, true);
	if (coolRanks) {
		reply += `\n*${coolRanks}*`;
	}

	reply += '\n' + formatStatLine(message, crew, stars + 1);

	if (custom) {
		reply += `\n\n**${custom}**`;
	}

	return reply;
}

interface CrewFromBehold {
	crew: Definitions.BotCrew;
	stars: number;
}

function recommendations(locale: Definitions.Locale, crew: CrewFromBehold[]) {
	let best = crew.sort((a, b) => a.crew.bigbook_tier - b.crew.bigbook_tier);
	let starBest = crew.filter((c) => c.stars > 0 && c.stars < c.crew.max_rarity);

	if (starBest.length > 0) {
		starBest = starBest.sort((a, b) => a.crew.bigbook_tier - b.crew.bigbook_tier);
	}

	let title = '';
	if (best[0].crew.bigbook_tier > 7) {
		if (starBest.length > 0) {
			title = Translate.get(locale, 'BEHOLD_RECOMMENDATIONS_ALLSUCK_STAR', { crew: Translate.localizeCrew(locale, starBest[0].crew) });
		} else {
			title = Translate.get(locale, 'BEHOLD_RECOMMENDATIONS_ALLSUCK', { crew: Translate.localizeCrew(locale, best[0].crew) });
		}
	} else {
		if (starBest.length > 0 && starBest[0].crew != best[0].crew) {
			if (starBest[0].crew.bigbook_tier > 7) {
				title = Translate.get(locale, 'BEHOLD_RECOMMENDATIONS_CANADDSTAR_CRAP', { crew: Translate.localizeCrew(locale, best[0].crew), starcrew: Translate.localizeCrew(locale, starBest[0].crew) });
			} else {
				title = Translate.get(locale, 'BEHOLD_RECOMMENDATIONS_CANADDSTAR', { crew: Translate.localizeCrew(locale, best[0].crew), starcrew: Translate.localizeCrew(locale, starBest[0].crew) });
			}
		} else {
			if (best[0].crew.bigbook_tier == best[1].crew.bigbook_tier) {
				title = Translate.get(locale, 'BEHOLD_RECOMMENDATIONS_SAMETIER', { crew1: Translate.localizeCrew(locale, best[0].crew), crew2: Translate.localizeCrew(locale, best[1].crew) });
			} else {
				let stars = 0;
				if (best[0].crew.symbol == crew[0].crew.symbol) {
					stars = crew[0].stars;
				} else if (best[0].crew.symbol == crew[1].crew.symbol) {
					stars = crew[1].stars;
				} else {
					stars = crew[2].stars;
				}

				let allMaxed =
					crew[0].stars == best[0].crew.max_rarity && crew[1].stars == best[0].crew.max_rarity && crew[2].stars == best[0].crew.max_rarity;

				if (!allMaxed && stars == best[0].crew.max_rarity) {
					if (best[1].crew.bigbook_tier < 6) {
						title = Translate.get(locale, 'BEHOLD_RECOMMENDATIONS_BESTALREADYMAXED', { crew1: Translate.localizeCrew(locale, best[0].crew), crew2: Translate.localizeCrew(locale, best[1].crew) });
					} else {
						// TODO: if both best[0] and best[1] are FF-d
						title = Translate.get(locale, 'BEHOLD_RECOMMENDATIONS_BESTALREADYMAXED_SECONDCRAP', { crew1: Translate.localizeCrew(locale, best[0].crew), crew2: Translate.localizeCrew(locale, best[1].crew) });
					}
				} else {
					title = Translate.get(locale, 'BEHOLD_RECOMMENDATIONS_BEST', { crew: Translate.localizeCrew(locale, best[0].crew) });
				}
			}
		}
	}

	return {
		best: best[0].crew,
		description: title
	};
}

function applyCrew(increw: Definitions.BotCrew, buffConfig: Definitions.BuffConfig): Definitions.BotCrew {
	let crew: Definitions.BotCrew = JSON.parse(JSON.stringify(increw));
	crew.base_skills = applyCrewBuffs(crew.base_skills, buffConfig, false);
	crew.skill_data.forEach((sd) => {
		sd.base_skills = applyCrewBuffs(sd.base_skills, buffConfig, false);
	});

	return crew;
}

export async function calculateBehold(
	locale: Definitions.Locale,
	message: Message,
	beholdResult: any,
	fromCommand: boolean,
	base: boolean
) {
	let crew1 = DCData.getBotCrew().find((c: any) => c.symbol === beholdResult.crew1.symbol);
	let crew2 = DCData.getBotCrew().find((c: any) => c.symbol === beholdResult.crew2.symbol);
	let crew3 = DCData.getBotCrew().find((c: any) => c.symbol === beholdResult.crew3.symbol);

	if (!crew1 || !crew2 || !crew3) {
		if (fromCommand) {
			sendAndCache(message, Translate.get(locale, 'BEHOLD_INVALID_CREW_SYMBOLS'));
		}

		return false;
	}

	if (crew1.max_rarity != crew2.max_rarity || crew2.max_rarity != crew3.max_rarity) {
		// Not a behold, or couldn't find the crew
		if (fromCommand) {
			sendAndCache(
				message,
				Translate.get(locale, 'BEHOLD_INVALID_CREW_RARITY', { crew1: crew1.name, crew2: crew2.name, crew3: crew3.name })
			);
		}

		return false;
	}

	let embed = new RichEmbed()
		.setTitle(Translate.get(locale, 'BEHOLD_TITLE'))
		.setColor(colorFromRarity(crew1.max_rarity))
		.setURL(`${CONFIG.DATACORE_URL}behold/?crew=${crew1.symbol}&crew=${crew2.symbol}&crew=${crew3.symbol}`);

	let customranks = ['', '', ''];
	if (!base) {
		let user = await userFromMessage(message);
		if (user && user.profiles.length > 0) {
			// Apply personalization

			// TODO: multiple profiles
			let profile = await loadProfile(user.profiles[0].dbid);
			if (profile) {
				crew1 = applyCrew(crew1, profile.buffConfig);
				crew2 = applyCrew(crew2, profile.buffConfig);
				crew3 = applyCrew(crew3, profile.buffConfig);

				let bcrew = [crew1, crew2, crew3];

				let found = [1, 1, 1];
				for (let entry of profile.crew) {
					for (let i = 0; i < 3; i++) {
						if (entry.id === bcrew[i].archetype_id && entry.rarity && entry.rarity < bcrew[i].max_rarity) {
							entry.rarity++;
							found[i] = entry.rarity;
						}
					}
				}

				for (let i = 0; i < 3; i++) {
					if (found[i] === 1) {
						profile.crew.push({ id: bcrew[i].archetype_id, rarity: 1 });
					}
				}

				let roster = loadProfileRoster(profile);

				roster = roster.sort((a, b) => b.voyageScore - a.voyageScore);
				let voyranks = bcrew.map((crew) => roster.findIndex((e) => e.crew.archetype_id === crew.archetype_id));

				roster = roster.sort((a, b) => b.gauntletScore - a.gauntletScore);
				let gauntletranks = bcrew.map((crew) => roster.findIndex((e) => e.crew.archetype_id === crew.archetype_id));

				for (let i = 0; i < 3; i++) {
					customranks[i] = Translate.get(locale, 'BEHOLD_CUSTOM_CREWRANK', {
						stars: found[i],
						crew: Translate.localizeCrew(locale, bcrew[i]),
						voyage: voyranks[i] + 1,
						gauntlet: gauntletranks[i] + 1
					});
				}

				embed = embed.addField(
					user.profiles[0].captainName,
					Translate.get(locale, 'BEHOLD_CUSTOM_PROFILE', { url: `${CONFIG.DATACORE_URL}profile/?dbid=${user.profiles[0].dbid}` })
				);
			}
		}
	}

	const { best, description } = recommendations(locale, [
		{ crew: crew1, stars: beholdResult.crew1.stars },
		{ crew: crew2, stars: beholdResult.crew2.stars },
		{ crew: crew3, stars: beholdResult.crew3.stars }
	]);

	embed = embed
		.setThumbnail(`${CONFIG.ASSETS_URL}${best.imageUrlPortrait}`)
		.setDescription(description)
		.addField(Translate.localizeCrew(locale, crew1), formatCrewField(locale, message, crew1, beholdResult.crew1.stars, customranks[0]))
		.addField(Translate.localizeCrew(locale, crew2), formatCrewField(locale, message, crew2, beholdResult.crew2.stars, customranks[1]))
		.addField(Translate.localizeCrew(locale, crew3), formatCrewField(locale, message, crew3, beholdResult.crew3.stars, customranks[2]))
		.setFooter(Translate.get(locale, customranks[0] ? 'BEHOLD_FOOTER_CUSTOM' : 'BEHOLD_FOOTER'));

	sendAndCache(message, embed);

	return true;
}
