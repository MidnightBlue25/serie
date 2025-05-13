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
 * Das Modul besteht aus der Klasse {@linkcode SerieWriteService} für die
 * Schreiboperationen im Anwendungskern.
 * @packageDocumentation
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type DeleteResult, Repository } from 'typeorm';
import { getLogger } from '../../logger/logger.js';
import { MailService } from '../../mail/mail.service.js';
import { Abbildung } from '../entity/abbildung.entity.js';
import { Serie } from '../entity/serie.entity.js';
import { SerieFile } from '../entity/serieFile.entity.js';
import { Titel } from '../entity/titel.entity.js';
import { SerieReadService } from './serie-read.service.js';
import {
    IsbnExistsException,
    VersionInvalidException,
    VersionOutdatedException,
} from './exceptions.js';

/** Typdefinitionen zum Aktualisieren einer Serie mit `update`. */
export type UpdateParams = {
    /** ID der zu aktualisierenden Serie. */
    readonly id: number | undefined;
    /** Serie-Objekt mit den aktualisierten Werten. */
    readonly serie: Serie;
    /** Versionsnummer für die aktualisierenden Werte. */
    readonly version: string;
};

// TODO Transaktionen, wenn mehr als 1 TypeORM-Schreibmethode involviert ist
// https://docs.nestjs.com/techniques/database#typeorm-transactions
// https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional
// https://betterprogramming.pub/handling-transactions-in-typeorm-and-nest-js-with-ease-3a417e6ab5
// https://bytesmith.dev/blog/20240320-nestjs-transactions

/**
 * Die Klasse `SerieWriteService` implementiert den Anwendungskern für das
 * Schreiben von Bücher und greift mit _TypeORM_ auf die DB zu.
 */
@Injectable()
export class SerieWriteService {
    private static readonly VERSION_PATTERN = /^"\d{1,3}"/u;

    readonly #repo: Repository<Serie>;

    readonly #fileRepo: Repository<SerieFile>;

    readonly #readService: SerieReadService;

    readonly #mailService: MailService;

    readonly #logger = getLogger(SerieWriteService.name);

    // eslint-disable-next-line max-params
    constructor(
        @InjectRepository(Serie) repo: Repository<Serie>,
        @InjectRepository(SerieFile) fileRepo: Repository<SerieFile>,
        readService: SerieReadService,
        mailService: MailService,
    ) {
        this.#repo = repo;
        this.#fileRepo = fileRepo;
        this.#readService = readService;
        this.#mailService = mailService;
    }

    /**
     * Eine neues Serie soll angelegt werden.
     * @param serie Die neu abzulegende Serie
     * @returns Die ID der neu angelegten Serie
     * @throws IsbnExists falls die ISBN-Nummer bereits existiert
     */
    async create(serie: Serie) {
        this.#logger.debug('create: serie=%o', serie);
        await this.#validateCreate(serie);

        const serieDb = await this.#repo.save(serie); // implizite Transaktion
        await this.#sendmail(serieDb);

        return serieDb.id!;
    }

    /**
     * Zu einer vorhandenen Serie ein3 Binärdatei mit z.B. einem Bild abspeichern.
     * @param serieId ID der vorhandenen Serie
     * @param data Bytes der Datei
     * @param filename Dateiname
     * @param mimetype MIME-Type
     * @returns Entity-Objekt für `SerieFile`
     */
    // eslint-disable-next-line max-params
    async addFile(
        serieId: number,
        data: Buffer,
        filename: string,
        mimetype: string,
    ): Promise<Readonly<SerieFile>> {
        this.#logger.debug(
            'addFile: serieId: %d, filename:%s, mimetype: %s',
            serieId,
            filename,
            mimetype,
        );

        // Serie ermitteln, falls vorhanden
        const serie = await this.#readService.findById({ id: serieId });

        // evtl. vorhandene Datei loeschen
        await this.#fileRepo
            .createQueryBuilder('serie_file')
            .delete()
            .where('serie_id = :id', { id: serieId })
            .execute();

        // Entity-Objekt aufbauen, um es spaeter in der DB zu speichern (s.u.)
        const serieFile = this.#fileRepo.create({
            filename,
            data,
            mimetype,
            serie,
        });

        // Den Datensatz fuer Serie mit der neuen Binaerdatei aktualisieren
        await this.#repo.save({
            id: serie.id,
            file: serieFile,
        });

        return serieFile;
    }

    /**
     * Eine vorhandene Serie soll aktualisiert werden. "Destructured" Argument
     * mit id (ID der zu aktualisierenden Serie), serie (zu aktualisierendes Serie)
     * und version (Versionsnummer für optimistische Synchronisation).
     * @returns Die neue Versionsnummer gemäß optimistischer Synchronisation
     * @throws NotFoundException falls keine Serie zur ID vorhanden ist
     * @throws VersionInvalidException falls die Versionsnummer ungültig ist
     * @throws VersionOutdatedException falls die Versionsnummer veraltet ist
     */
    // https://2ality.com/2015/01/es6-destructuring.html#simulating-named-parameters-in-javascript
    async update({ id, serie, version }: UpdateParams) {
        this.#logger.debug(
            'update: id=%d, serie=%o, version=%s',
            id,
            serie,
            version,
        );
        if (id === undefined) {
            this.#logger.debug('update: Keine gueltige ID');
            throw new NotFoundException(`Es gibt keine Serie mit der ID ${id}.`);
        }

        const validateResult = await this.#validateUpdate(serie, id, version);
        this.#logger.debug('update: validateResult=%o', validateResult);
        if (!(validateResult instanceof Serie)) {
            return validateResult;
        }

        const serieNeu = validateResult;
        const merged = this.#repo.merge(serieNeu, serie);
        this.#logger.debug('update: merged=%o', merged);
        const updated = await this.#repo.save(merged); // implizite Transaktion
        this.#logger.debug('update: updated=%o', updated);

        return updated.version!;
    }

    /**
     * Eine Serie wird asynchron anhand seiner ID gelöscht.
     *
     * @param id ID der zu löschenden Serie
     * @returns true, falls die Serie vorhanden war und gelöscht wurde. Sonst false.
     */
    async delete(id: number) {
        this.#logger.debug('delete: id=%d', id);
        const serie = await this.#readService.findById({
            id,
            mitAbbildungen: true,
        });

        let deleteResult: DeleteResult | undefined;
        await this.#repo.manager.transaction(async (transactionalMgr) => {
            // Die Serie zur gegebenen ID mit Titel und Abb. asynchron loeschen

            // TODO "cascade" funktioniert nicht beim Loeschen
            const titelId = serie.titel?.id;
            if (titelId !== undefined) {
                await transactionalMgr.delete(Titel, titelId);
            }
            // "Nullish Coalescing" ab ES2020
            const abbildungen = serie.abbildungen ?? [];
            for (const abbildung of abbildungen) {
                await transactionalMgr.delete(Abbildung, abbildung.id);
            }

            deleteResult = await transactionalMgr.delete(Serie, id);
            this.#logger.debug('delete: deleteResult=%o', deleteResult);
        });

        return (
            deleteResult?.affected !== undefined &&
            deleteResult.affected !== null &&
            deleteResult.affected > 0
        );
    }

    async #validateCreate({ isbn }: Serie): Promise<undefined> {
        this.#logger.debug('#validateCreate: isbn=%s', isbn);
        if (await this.#repo.existsBy({ isbn })) {
            throw new IsbnExistsException(isbn);
        }
    }

    async #sendmail(serie: Serie) {
        const subject = `Neue Serie ${serie.id}`;
        const titel = serie.titel?.titel ?? 'N/A';
        const body = `Die Serie mit dem Titel <strong>${titel}</strong> ist angelegt`;
        await this.#mailService.sendmail({ subject, body });
    }

    async #validateUpdate(
        serie: Serie,
        id: number,
        versionStr: string,
    ): Promise<Serie> {
        this.#logger.debug(
            '#validateUpdate: serie=%o, id=%s, versionStr=%s',
            serie,
            id,
            versionStr,
        );
        if (!SerieWriteService.VERSION_PATTERN.test(versionStr)) {
            throw new VersionInvalidException(versionStr);
        }

        const version = Number.parseInt(versionStr.slice(1, -1), 10);
        this.#logger.debug(
            '#validateUpdate: serie=%o, version=%d',
            serie,
            version,
        );

        const serieDb = await this.#readService.findById({ id });

        // nullish coalescing
        const versionDb = serieDb.version!;
        if (version < versionDb) {
            this.#logger.debug('#validateUpdate: versionDb=%d', version);
            throw new VersionOutdatedException(version);
        }
        this.#logger.debug('#validateUpdate: serieDb=%o', serieDb);
        return serieDb;
    }
}
