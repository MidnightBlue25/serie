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

/**
 * Das Modul besteht aus der Klasse {@linkcode SerieReadService}.
 * @packageDocumentation
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getLogger } from '../../logger/logger.js';
import { SerieFile } from '../entity/serieFile.entity.js';
import { Serie } from '../entity/serie.entity.js';
import { type Pageable } from './pageable.js';
import { type Slice } from './slice.js';
import { QueryBuilder } from './query-builder.js';
import { type Suchkriterien } from './suchkriterien.js';

/**
 * Typdefinition für `findById`
 */
export type FindByIdParams = {
    /** ID der gesuchten Serie */
    readonly id: number;
    /** Sollen die Covers mitgeladen werden? */
    readonly mitCovers?: boolean;
};

/**
 * Die Klasse `SerieReadService` implementiert das Lesen für Bücher und greift
 * mit _TypeORM_ auf eine relationale DB zu.
 */
@Injectable()
export class SerieReadService {
    static readonly ID_PATTERN = /^[1-9]\d{0,10}$/u;

    readonly #serieProps: string[];

    readonly #queryBuilder: QueryBuilder;

    readonly #fileRepo: Repository<SerieFile>;

    readonly #logger = getLogger(SerieReadService.name);

    constructor(
        queryBuilder: QueryBuilder,
        @InjectRepository(SerieFile) fileRepo: Repository<SerieFile>,
    ) {
        const serieDummy = new Serie();
        this.#serieProps = Object.getOwnPropertyNames(serieDummy);
        this.#queryBuilder = queryBuilder;
        this.#fileRepo = fileRepo;
    }

    // Rueckgabetyp Promise bei asynchronen Funktionen
    //    ab ES2015
    //    vergleiche Task<> bei C#
    // Status eines Promise:
    //    Pending: das Resultat ist noch nicht vorhanden, weil die asynchrone
    //             Operation noch nicht abgeschlossen ist
    //    Fulfilled: die asynchrone Operation ist abgeschlossen und
    //               das Promise-Objekt hat einen Wert
    //    Rejected: die asynchrone Operation ist fehlgeschlagen and das
    //              Promise-Objekt wird nicht den Status "fulfilled" erreichen.
    //              Im Promise-Objekt ist dann die Fehlerursache enthalten.

    /**
     * Eine Serie asynchron anhand seiner ID suchen
     * @param id ID der gesuchten Serie
     * @returns Die gefundene Serie in einem Promise aus ES2015.
     * @throws NotFoundException falls keine Serie mit der ID existiert
     */
    // https://2ality.com/2015/01/es6-destructuring.html#simulating-named-parameters-in-javascript
    async findById({
        id,
        mitCovers = false,
    }: FindByIdParams): Promise<Readonly<Serie>> {
        this.#logger.debug('findById: id=%d', id);

        // https://typeorm.io/working-with-repository
        // Das Resultat ist undefined, falls kein Datensatz gefunden
        // Lesen: Keine Transaktion erforderlich
        const serie = await this.#queryBuilder
            .buildId({ id, mitCovers })
            .getOne();
        if (serie === null) {
            throw new NotFoundException(
                `Es gibt keine Serie mit der ID ${id}.`,
            );
        }
        if (serie.schlagwoerter === null) {
            serie.schlagwoerter = [];
        }

        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug(
                'findById: serie=%s, titel=%o',
                serie.toString(),
                serie.titel,
            );
            if (mitCovers) {
                this.#logger.debug(
                    'findById: covers=%o',
                    serie.covers,
                );
            }
        }
        return serie;
    }

    /**
     * Binärdatei zu einer Serie suchen.
     * @param serieId ID der zugehörigen Serie.
     * @returns Binärdatei oder undefined als Promise.
     */
    async findFileBySerieId(
        serieId: number,
    ): Promise<Readonly<SerieFile> | undefined> {
        this.#logger.debug('findFileBySerieId: serieId=%s', serieId);
        const serieFile = await this.#fileRepo
            .createQueryBuilder('serie_file')
            .where('serie_id = :id', { id: serieId })
            .getOne();
        if (serieFile === null) {
            this.#logger.debug('findFileBySerieId: Keine Datei gefunden');
            return;
        }

        this.#logger.debug(
            'findFileBySerieId: filename=%s',
            serieFile.filename,
        );
        return serieFile;
    }

    /**
     * Bücher asynchron suchen.
     * @param suchkriterien JSON-Objekt mit Suchkriterien.
     * @param pageable Maximale Anzahl an Datensätzen und Seitennummer.
     * @returns Ein JSON-Array mit den gefundenen Büchern.
     * @throws NotFoundException falls keine Bücher gefunden wurden.
     */
    async find(
        suchkriterien: Suchkriterien | undefined,
        pageable: Pageable,
    ): Promise<Slice<Serie>> {
        this.#logger.debug(
            'find: suchkriterien=%o, pageable=%o',
            suchkriterien,
            pageable,
        );

        // Keine Suchkriterien?
        if (suchkriterien === undefined) {
            return await this.#findAll(pageable);
        }
        const keys = Object.keys(suchkriterien);
        if (keys.length === 0) {
            return await this.#findAll(pageable);
        }

        // Falsche Namen fuer Suchkriterien?
        if (!this.#checkKeys(keys) || !this.#checkEnums(suchkriterien)) {
            throw new NotFoundException('Ungueltige Suchkriterien');
        }

        // QueryBuilder https://typeorm.io/select-query-builder
        // Das Resultat ist eine leere Liste, falls nichts gefunden
        // Lesen: Keine Transaktion erforderlich
        const queryBuilder = this.#queryBuilder.build(suchkriterien, pageable);
        const buecher = await queryBuilder.getMany();
        if (buecher.length === 0) {
            this.#logger.debug('find: Keine Buecher gefunden');
            throw new NotFoundException(
                `Keine Buecher gefunden: ${JSON.stringify(suchkriterien)}, Seite ${pageable.number}}`,
            );
        }
        const totalElements = await queryBuilder.getCount();
        return this.#createSlice(buecher, totalElements);
    }

    async #findAll(pageable: Pageable) {
        const queryBuilder = this.#queryBuilder.build({}, pageable);
        const buecher = await queryBuilder.getMany();
        if (buecher.length === 0) {
            throw new NotFoundException(
                `Ungueltige Seite "${pageable.number}"`,
            );
        }
        const totalElements = await queryBuilder.getCount();
        return this.#createSlice(buecher, totalElements);
    }

    #createSlice(buecher: Serie[], totalElements: number) {
        buecher.forEach((serie) => {
            if (serie.schlagwoerter === null) {
                serie.schlagwoerter = [];
            }
        });
        const serieSlice: Slice<Serie> = {
            content: buecher,
            totalElements,
        };
        this.#logger.debug('createSlice: serieSlice=%o', serieSlice);
        return serieSlice;
    }

    #checkKeys(keys: string[]) {
        this.#logger.debug('#checkKeys: keys=%s', keys);
        // Ist jedes Suchkriterium auch eine Property von Serie oder "schlagwoerter"?
        let validKeys = true;
        keys.forEach((key) => {
            if (
                !this.#serieProps.includes(key) &&
                key !== 'javascript' &&
                key !== 'typescript' &&
                key !== 'java' &&
                key !== 'python'
            ) {
                this.#logger.debug(
                    '#checkKeys: ungueltiges Suchkriterium "%s"',
                    key,
                );
                validKeys = false;
            }
        });

        return validKeys;
    }

    #checkEnums(suchkriterien: Suchkriterien) {
        const { art } = suchkriterien;
        this.#logger.debug('#checkEnums: Suchkriterium "art=%s"', art);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return (
            art === undefined ||
            art === 'STREAM' ||
            art === 'TV' ||
            art === 'DVD'
        );
    }
}
