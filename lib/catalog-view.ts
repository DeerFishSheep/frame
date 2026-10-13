import type { CatalogResponse } from "./types";

/** The data and its label/ranking meaning are committed together, across every provider. */
export interface CatalogView extends CatalogResponse {
  context: {
    title: string;
    featuredLabel: string;
    ranked: boolean;
    startPage: number;
    feature: boolean;
  };
}
