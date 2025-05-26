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

import { beforeAll, describe, expect, inject, test } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { Decimal } from 'decimal.js';
import { type SerieDtoOhneRef } from '../../src/serie/controller/serieDTO.entity.js';
import { baseURL, httpsAgent } from '../constants.mjs';
import { type ErrorResponse } from './error-response.mjs';

const token = inject('tokenRest');

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
const geaenderteSerie: Omit<SerieDtoOhneRef, 'preis' | 'rabatt'> & {
    preis: number;
    rabatt: number;
} = {
    seriennummer: 'SER-444555',
    rating: 5,
    art: 'STREAM',
    preis: 3333,
    rabatt: 0.033,
    trailer: true,
    datum: '2022-03-03',
    homepage: 'https://geaendert.put.rest',
    schlagwoerter: ['JAVA'],
};
const idVorhanden = '30';

const geaenderteSerieIdNichtVorhanden: Omit<
    SerieDtoOhneRef,
    'preis' | 'rabatt'
> & {
    preis: number;
    rabatt: number;
} = {
    seriennummer: 'SER-444512',
    rating: 4,
    art: 'TV',
    preis: 44.4,
    rabatt: 0.044,
    trailer: true,
    datum: '2022-02-04',
    homepage: 'https://acme.de',
    schlagwoerter: ['JAVASCRIPT'],
};
const idNichtVorhanden = '999999';

const geaenderteSerieInvalid: Record<string, unknown> = {
    seriennummer: 'falsche-Seriennummer',
    rating: -1,
    art: 'UNSICHTBAR',
    preis: -1,
    rabatt: 2,
    trailer: true,
    datum: '12345-123-123',
    homepage: 'anyHomepage',
};

const veralteSerie: SerieDtoOhneRef = {
    seriennummer: 'SER-444512',
    rating: 1,
    art: 'TV',
    preis: new Decimal(44.4),
    rabatt: new Decimal(0.04),
    trailer: true,
    datum: '2022-02-04',
    homepage: 'https://acme.de',
    schlagwoerter: ['JAVASCRIPT'],
};

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
// Test-Suite
describe('PUT /rest/:id', () => {
    let client: AxiosInstance;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // Axios initialisieren
    beforeAll(async () => {
        client = axios.create({
            baseURL,
            headers,
            httpsAgent,
            validateStatus: (status) => status < 500,
        });
    });

    test('Vorhandene Serie aendern', async () => {
        // given
        const url = `/rest/${idVorhanden}`;
        headers.Authorization = `Bearer ${token}`;
        headers['If-Match'] = '"0"';

        // when
        const { status, data }: AxiosResponse<string> = await client.put(
            url,
            geaenderteSerie,
            { headers },
        );

        // then
        expect(status).toBe(HttpStatus.NO_CONTENT);
        expect(data).toBe('');
    });

    test('Nicht-vorhandene Serie aendern', async () => {
        // given
        const url = `/rest/${idNichtVorhanden}`;
        headers.Authorization = `Bearer ${token}`;
        headers['If-Match'] = '"0"';

        // when
        const { status }: AxiosResponse<string> = await client.put(
            url,
            geaenderteSerieIdNichtVorhanden,
            { headers },
        );

        // then
        expect(status).toBe(HttpStatus.NOT_FOUND);
    });

    test('Vorhandene Serie aendern, aber mit ungueltigen Daten', async () => {
        // given
        const url = `/rest/${idVorhanden}`;
        headers.Authorization = `Bearer ${token}`;
        headers['If-Match'] = '"0"';
        const expectedMsg = [
            expect.stringMatching(/^seriennummer /u),
            expect.stringMatching(/^rating /u),
            expect.stringMatching(/^art /u),
            expect.stringMatching(/^preis /u),
            expect.stringMatching(/^rabatt /u),
            expect.stringMatching(/^datum /u),
            expect.stringMatching(/^homepage /u),
        ];

        // when
        const { status, data }: AxiosResponse<Record<string, any>> =
            await client.put(url, geaenderteSerieInvalid, { headers });

        // then
        expect(status).toBe(HttpStatus.BAD_REQUEST);

        const messages = data.message as string[];

        expect(messages).toBeDefined();
        expect(messages).toHaveLength(expectedMsg.length);
        expect(messages).toStrictEqual(expect.arrayContaining(expectedMsg));
    });

    test('Vorhandene Serie aendern, aber ohne Versionsnummer', async () => {
        // given
        const url = `/rest/${idVorhanden}`;
        headers.Authorization = `Bearer ${token}`;
        delete headers['If-Match'];

        // when
        const { status, data }: AxiosResponse<string> = await client.put(
            url,
            geaenderteSerie,
            { headers },
        );

        // then
        expect(status).toBe(HttpStatus.PRECONDITION_REQUIRED);
        expect(data).toBe('Header "If-Match" fehlt');
    });

    test('Vorhandene Serie aendern, aber mit alter Versionsnummer', async () => {
        // given
        const url = `/rest/${idVorhanden}`;
        headers.Authorization = `Bearer ${token}`;
        headers['If-Match'] = '"-1"';

        // when
        const { status, data }: AxiosResponse<ErrorResponse> = await client.put(
            url,
            veralteSerie,
            { headers },
        );

        // then
        expect(status).toBe(HttpStatus.PRECONDITION_FAILED);

        const { message, statusCode } = data;

        expect(message).toMatch(/Versionsnummer/u);
        expect(statusCode).toBe(HttpStatus.PRECONDITION_FAILED);
    });

    test('Vorhandene Serie aendern, aber ohne Token', async () => {
        // given
        const url = `/rest/${idVorhanden}`;
        delete headers.Authorization;
        headers['If-Match'] = '"0"';

        // when
        const response: AxiosResponse<Record<string, any>> = await client.put(
            url,
            geaenderteSerie,
            { headers },
        );

        // then
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test('Vorhandene Serie aendern, aber mit falschem Token', async () => {
        // given
        const url = `/rest/${idVorhanden}`;
        const token = 'FALSCH';
        headers.Authorization = `Bearer ${token}`;

        // when
        const response: AxiosResponse<Record<string, any>> = await client.put(
            url,
            geaenderteSerie,
            { headers },
        );

        // then
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
});
