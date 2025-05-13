/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Copyright (C) 2025 - present Juergen Zimmermann, Hochschule Karlsruhe
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { type GraphQLRequest } from '@apollo/server';
import { beforeAll, describe, expect, test } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { type Serie, type SerieArt } from '../../src/serie/entity/serie.entity.js';
import { type GraphQLResponseBody } from './graphql.mjs';
import { baseURL, httpsAgent } from '../constants.mjs';

type SerieDTO = Omit<
    Serie,
    'abbildungen' | 'aktualisiert' | 'erzeugt' | 'rabatt'
> & {
    rabatt: string;
};

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
const idVorhanden = '1';

const titelVorhanden = 'Alpha';
const teilTitelVorhanden = 'a';
const teilTitelNichtVorhanden = 'abc';

const isbnVorhanden = '978-3-897-22583-1';

const ratingMin = 3;
const ratingNichtVorhanden = 99;

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
// Test-Suite
describe('GraphQL Queries', () => {
    let client: AxiosInstance;
    const graphqlPath = 'graphql';

    // Axios initialisieren
    beforeAll(async () => {
        const baseUrlGraphQL = `${baseURL}/`;
        client = axios.create({
            baseURL: baseUrlGraphQL,
            httpsAgent,
            // auch Statuscode 400 als gueltigen Request akzeptieren, wenn z.B.
            // ein Enum mit einem falschen String getestest wird
            validateStatus: () => true,
        });
    });

    test.concurrent('Serie zu vorhandener ID', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    serie(id: "${idVorhanden}") {
                        version
                        isbn
                        rating
                        art
                        preis
                        lieferbar
                        datum
                        homepage
                        schlagwoerter
                        titel {
                            titel
                        }
                        rabatt(short: true)
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { serie } = data.data! as { serie: SerieDTO };

        expect(serie.titel?.titel).toMatch(/^\w/u);
        expect(serie.version).toBeGreaterThan(-1);
        expect(serie.id).toBeUndefined();
    });

    test.concurrent('Serie zu nicht-vorhandener ID', async () => {
        // given
        const id = '999999';
        const body: GraphQLRequest = {
            query: `
                {
                    serie(id: "${id}") {
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.serie).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toBe(`Es gibt keine Serie mit der ID ${id}.`);
        expect(path).toBeDefined();
        expect(path![0]).toBe('serie');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test.concurrent('Serie zu vorhandenem Titel', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    serien(suchkriterien: {
                        titel: "${titelVorhanden}"
                    }) {
                        art
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { serien } = data.data! as { serien: SerieDTO[] };

        expect(serien).not.toHaveLength(0);
        expect(serien).toHaveLength(1);

        const [serie] = serien;

        expect(serie!.titel?.titel).toBe(titelVorhanden);
    });

    test.concurrent('Serie zu vorhandenem Teil-Titel', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    serien(suchkriterien: {
                        titel: "${teilTitelVorhanden}"
                    }) {
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { serien } = data.data! as { serien: SerieDTO[] };

        expect(serien).not.toHaveLength(0);

        serien
            .map((serie) => serie.titel)
            .forEach((titel) =>
                expect(titel?.titel?.toLowerCase()).toStrictEqual(
                    expect.stringContaining(teilTitelVorhanden),
                ),
            );
    });

    test.concurrent('Serie zu nicht vorhandenem Titel', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    serien(suchkriterien: {
                        titel: "${teilTitelNichtVorhanden}"
                    }) {
                        art
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.serien).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toMatch(/^Keine Serien gefunden:/u);
        expect(path).toBeDefined();
        expect(path![0]).toBe('serien');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test.concurrent('Serie zu vorhandener ISBN-Nummer', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    serien(suchkriterien: {
                        isbn: "${isbnVorhanden}"
                    }) {
                        isbn
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { serien } = data.data! as { serien: SerieDTO[] };

        expect(serien).not.toHaveLength(0);
        expect(serien).toHaveLength(1);

        const [serie] = serien;
        const { isbn, titel } = serie!;

        expect(isbn).toBe(isbnVorhanden);
        expect(titel?.titel).toBeDefined();
    });

    test.concurrent('Serien mit Mindest-"rating"', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    serien(suchkriterien: {
                        rating: ${ratingMin},
                        titel: "${teilTitelVorhanden}"
                    }) {
                        rating
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();

        expect(data.data).toBeDefined();

        const { serien } = data.data! as { serien: SerieDTO[] };

        expect(serien).not.toHaveLength(0);

        serien.forEach((serie) => {
            const { rating, titel } = serie;

            expect(rating).toBeGreaterThanOrEqual(ratingMin);
            expect(titel?.titel?.toLowerCase()).toStrictEqual(
                expect.stringContaining(teilTitelVorhanden),
            );
        });
    });

    test.concurrent('Keine Serie zu nicht-vorhandenem "rating"', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    serien(suchkriterien: {
                        rating: ${ratingNichtVorhanden}
                    }) {
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.serien).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toMatch(/^Keine Serien gefunden:/u);
        expect(path).toBeDefined();
        expect(path![0]).toBe('serien');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test.concurrent('Serien zur Art "EPUB"', async () => {
        // given
        const serieArt: SerieArt = 'EPUB';
        const body: GraphQLRequest = {
            query: `
                {
                    serien(suchkriterien: {
                        art: ${serieArt}
                    }) {
                        art
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { serien } = data.data! as { serien: SerieDTO[] };

        expect(serien).not.toHaveLength(0);

        serien.forEach((serie) => {
            const { art, titel } = serie;

            expect(art).toBe(serieArt);
            expect(titel?.titel).toBeDefined();
        });
    });

    test.concurrent('Serien zur einer ungueltigen Art', async () => {
        // given
        const serieArt = 'UNGUELTIG';
        const body: GraphQLRequest = {
            query: `
                {
                    serien(suchkriterien: {
                        art: ${serieArt}
                    }) {
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.BAD_REQUEST);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data).toBeUndefined();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { extensions } = error;

        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('GRAPHQL_VALIDATION_FAILED');
    });

    test.concurrent('Serien mit lieferbar=true', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    serien(suchkriterien: {
                        lieferbar: true
                    }) {
                        lieferbar
                        titel {
                            titel
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { serien } = data.data! as { serien: SerieDTO[] };

        expect(serien).not.toHaveLength(0);

        serien.forEach((serie) => {
            const { lieferbar, titel } = serie;

            expect(lieferbar).toBe(true);
            expect(titel?.titel).toBeDefined();
        });
    });
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
