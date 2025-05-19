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

import { beforeAll, describe, expect, inject, test } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { Decimal } from 'decimal.js';
import { type SerieDTO } from '../../src/serie/controller/serieDTO.entity.js';
import { SerieReadService } from '../../src/serie/service/serie-read.service.js';
import { baseURL, httpsAgent } from '../constants.mjs';
import { type ErrorResponse } from './error-response.mjs';

const token = inject('tokenRest');

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
    episode: 2,
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
    rating: 4,
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
describe('POST /rest', () => {
    let client: AxiosInstance;
    const restURL = `${baseURL}/rest`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // Axios initialisieren
    beforeAll(async () => {
        client = axios.create({
            baseURL: restURL,
            httpsAgent,
            validateStatus: (status) => status < 500,
        });
    });

    test('Neue Serie', async () => {
        // given
        headers.Authorization = `Bearer ${token}`;

        // when
        const response: AxiosResponse<string> = await client.post(
            '',
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

    test.concurrent('Neue Serie mit ungueltigen Daten', async () => {
        // given
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
            '',
            neueSerieInvalid,
            { headers },
        );

        // then
        const { status, data } = response;

        expect(status).toBe(HttpStatus.BAD_REQUEST);

        const messages = data.message as string[];

        expect(messages).toBeDefined();
        expect(messages).toHaveLength(expectedMsg.length);
        expect(messages).toStrictEqual(expect.arrayContaining(expectedMsg));
    });

    test.concurrent('Neue Serie, aber ohne Token', async () => {
        // when
        const response: AxiosResponse<Record<string, any>> = await client.post(
            '',
            neueSerie,
        );

        // then
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test.concurrent('Neue Serie, aber mit falschem Token', async () => {
        // given
        const token = 'FALSCH';
        headers.Authorization = `Bearer ${token}`;

        // when
        const response: AxiosResponse<Record<string, any>> = await client.post(
            '',
            neueSerie,
            { headers },
        );

        // then
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test.concurrent.todo('Abgelaufener Token');
});
