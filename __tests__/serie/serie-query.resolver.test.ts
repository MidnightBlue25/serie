/* eslint-disable max-lines, @typescript-eslint/no-non-null-assertion */
// Copyright (C) 2016 - present Juergen Zimmermann, Hochschule Karlsruhe
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
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { type Serie, type SerieArt } from '../../src/serie/entity/serie.entity.js';
import { type GraphQLResponseBody } from '../graphql.js';
import {
    host,
    httpsAgent,
    port,
    shutdownServer,
    startServer,
} from '../testserver.js';

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
// eslint-disable-next-line max-lines-per-function
describe('GraphQL Queries', () => {
    let client: AxiosInstance;
    const graphqlPath = 'graphql';

    // Testserver starten und dabei mit der DB verbinden
    beforeAll(async () => {
        await startServer();
        const baseURL = `https://${host}:${port}/`;
        client = axios.create({
            baseURL,
            httpsAgent,
            // auch Statuscode 400 als gueltigen Request akzeptieren, wenn z.B.
            // ein Enum mit einem falschen String getestest wird
            validateStatus: () => true,
        });
    });

    afterAll(async () => {
        await shutdownServer();
    });

    test('Serie zu vorhandener ID', async () => {
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

    test('Serie zu nicht-vorhandener ID', async () => {
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

    test('Serie zu vorhandenem Titel', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    buecher(suchkriterien: {
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

        const { buecher } = data.data! as { buecher: SerieDTO[] };

        expect(buecher).not.toHaveLength(0);
        expect(buecher).toHaveLength(1);

        const [serie] = buecher;

        expect(serie!.titel?.titel).toBe(titelVorhanden);
    });

    test('Serie zu vorhandenem Teil-Titel', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    buecher(suchkriterien: {
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

        const { buecher } = data.data! as { buecher: SerieDTO[] };

        expect(buecher).not.toHaveLength(0);

        buecher
            .map((serie) => serie.titel)
            .forEach((titel) =>
                expect(titel?.titel.toLowerCase()).toEqual(
                    expect.stringContaining(teilTitelVorhanden),
                ),
            );
    });

    test('Serie zu nicht vorhandenem Titel', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    buecher(suchkriterien: {
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
        expect(data.data!.buecher).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toMatch(/^Keine Buecher gefunden:/u);
        expect(path).toBeDefined();
        expect(path![0]).toBe('buecher');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test('Serie zu vorhandener ISBN-Nummer', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    buecher(suchkriterien: {
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

        const { buecher } = data.data! as { buecher: SerieDTO[] };

        expect(buecher).not.toHaveLength(0);
        expect(buecher).toHaveLength(1);

        const [serie] = buecher;
        const { isbn, titel } = serie!;

        expect(isbn).toBe(isbnVorhanden);
        expect(titel?.titel).toBeDefined();
    });

    test('Buecher mit Mindest-"rating"', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    buecher(suchkriterien: {
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

        const { buecher } = data.data! as { buecher: SerieDTO[] };

        expect(buecher).not.toHaveLength(0);

        buecher.forEach((serie) => {
            const { rating, titel } = serie;

            expect(rating).toBeGreaterThanOrEqual(ratingMin);
            expect(titel?.titel.toLowerCase()).toEqual(
                expect.stringContaining(teilTitelVorhanden),
            );
        });
    });

    test('Keine Serie zu nicht-vorhandenem "rating"', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    buecher(suchkriterien: {
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
        expect(data.data!.buecher).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toMatch(/^Keine Buecher gefunden:/u);
        expect(path).toBeDefined();
        expect(path![0]).toBe('buecher');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test('Buecher zur Art "EPUB"', async () => {
        // given
        const serieArt: SerieArt = 'EPUB';
        const body: GraphQLRequest = {
            query: `
                {
                    buecher(suchkriterien: {
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

        const { buecher } = data.data! as { buecher: SerieDTO[] };

        expect(buecher).not.toHaveLength(0);

        buecher.forEach((serie) => {
            const { art, titel } = serie;

            expect(art).toBe(serieArt);
            expect(titel?.titel).toBeDefined();
        });
    });

    test('Buecher zur einer ungueltigen Art', async () => {
        // given
        const serieArt = 'UNGUELTIG';
        const body: GraphQLRequest = {
            query: `
                {
                    buecher(suchkriterien: {
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

    test('Buecher mit lieferbar=true', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    buecher(suchkriterien: {
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

        const { buecher } = data.data! as { buecher: SerieDTO[] };

        expect(buecher).not.toHaveLength(0);

        buecher.forEach((serie) => {
            const { lieferbar, titel } = serie;

            expect(lieferbar).toBe(true);
            expect(titel?.titel).toBeDefined();
        });
    });
});

/* eslint-enable max-lines, , @typescript-eslint/no-non-null-assertion */
