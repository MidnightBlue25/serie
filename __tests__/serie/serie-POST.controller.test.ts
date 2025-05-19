/* eslint-disable @typescript-eslint/no-magic-numbers */
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

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { Decimal } from 'decimal.js';
import { type SerieDTO } from '../../src/serie/controller/serieDTO.entity.js';
import { SerieReadService } from '../../src/serie/service/serie-read.service.js';
import {
    host,
    httpsAgent,
    port,
    shutdownServer,
    startServer,
} from '../testserver.js';
import { tokenRest } from '../token.js';
import { type ErrorResponse } from './error-response.js';

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
const neueSerie: Omit<SerieDTO, 'preis' | 'episode'> & {
    preis: number;
    episode: number;
} = {
    rating: 1,
    art: 'TV',
    preis: 99.99,
    episode: 3,
    trailer: true,
    datum: '2022-02-28',
    homepage: 'https://post.rest',
    schlagwoerter: ['JAVASCRIPT', 'TYPESCRIPT'],
    titel: {
        titel: 'Titelpost',
        untertitel: 'untertitelpos',
    },
    covers: [
        {
            beschriftung: 'Abb. 1',
            contentType: 'img/png',
        },
    ],
};
const neueSerieInvalid: Record<string, unknown> = {
    rating: 1,
    art: 'UNSICHTBAR',
    preis: 1,
    episode: 2,
    trailer: true,
    datum: '12345-123-123',
    homepage: 'anyHomepage',
    titel: {
        titel: '?!',
        untertitel: 'Untertitelinvalid',
    },
};

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
// Test-Suite
// eslint-disable-next-line max-lines-per-function
describe('POST /rest', () => {
    let client: AxiosInstance;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json', // eslint-disable-line @typescript-eslint/naming-convention
    };

    // Testserver starten und dabei mit der DB verbinden
    beforeAll(async () => {
        await startServer();
        const baseURL = `https://${host}:${port}`;
        client = axios.create({
            baseURL,
            httpsAgent,
            validateStatus: (status) => status < 500,
        });
    });

    afterAll(async () => {
        await shutdownServer();
    });

    test('Neue Serie', async () => {
        // given
        const token = await tokenRest(client);
        headers.Authorization = `Bearer ${token}`;

        // when
        const response: AxiosResponse<string> = await client.post(
            '/rest',
            neueSerie,
            { headers },
        );

        // then
        const { status, data } = response;

        expect(status).toBe(HttpStatus.CREATED);

        const { location } = response.headers as { location: string };

        expect(location).toBeDefined();

        // ID nach dem letzten "/"
        const indexLastSlash: number = location.lastIndexOf('/');

        expect(indexLastSlash).not.toBe(-1);

        const idStr = location.slice(indexLastSlash + 1);

        expect(idStr).toBeDefined();
        expect(SerieReadService.ID_PATTERN.test(idStr)).toBe(true);

        expect(data).toBe('');
    });

    test('Neue Serie mit ungueltigen Daten', async () => {
        // given
        const token = await tokenRest(client);
        headers.Authorization = `Bearer ${token}`;
        const expectedMsg = [
            expect.stringMatching(/^rating /u),
            expect.stringMatching(/^art /u),
            expect.stringMatching(/^preis /u),
            expect.stringMatching(/^episode /u),
            expect.stringMatching(/^datum /u),
            expect.stringMatching(/^homepage /u),
            expect.stringMatching(/^titel.titel /u),
        ];

        // when
        const response: AxiosResponse<Record<string, any>> = await client.post(
            '/rest',
            neueSerieInvalid,
            { headers },
        );

        // then
        const { status, data } = response;

        expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);

        const messages = data.message as string[];

        expect(messages).toBeDefined();
        expect(messages).toHaveLength(expectedMsg.length);
        expect(messages).toEqual(expect.arrayContaining(expectedMsg));
    });

    test('Neue Serie, aber ohne Token', async () => {
        // when
        const response: AxiosResponse<Record<string, any>> = await client.post(
            '/rest',
            neueSerie,
        );

        // then
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test('Neue Serie, aber mit falschem Token', async () => {
        // given
        const token = 'FALSCH';
        headers.Authorization = `Bearer ${token}`;

        // when
        const response: AxiosResponse<Record<string, any>> = await client.post(
            '/rest',
            neueSerie,
            { headers },
        );

        // then
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test.todo('Abgelaufener Token');
});
/* eslint-enable @typescript-eslint/no-magic-numbers */
