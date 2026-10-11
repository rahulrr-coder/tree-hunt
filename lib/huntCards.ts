import coimbatore from "../data/hunt-cards/coimbatore.json";

export type Plant = (typeof coimbatore.plants)[number];
export type HuntCard = { id: string; city: string; title: string; plants: Plant[] };

// Adding a city: drop a JSON file in data/hunt-cards/ and add one line here.
const cards: Record<string, HuntCard> = { coimbatore };

export const defaultCardId = "coimbatore";
export const getCard = (id: string): HuntCard | undefined => cards[id];
