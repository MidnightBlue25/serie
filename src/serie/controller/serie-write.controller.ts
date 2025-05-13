/* eslint-disable max-lines */
// Copyright (C) 2021 - present Juergen Zimmermann, Hochschule Karlsruhe
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
 * Das Modul besteht aus der Controller-Klasse für Schreiben an der REST-Schnittstelle.
 * @packageDocumentation
 */

import {
    Body,
    Controller,
    Delete,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Req,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiHeader,
    ApiNoContentResponse,
    ApiOperation,
    ApiParam,
    ApiPreconditionFailedResponse,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import Decimal from 'decimal.js'; // eslint-disable-line @typescript-eslint/naming-convention
import { Express, Request, Response } from 'express';
import { AuthGuard, Public, Roles } from 'nest-keycloak-connect';
import { paths } from '../../config/paths.js';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { type Abbildung } from '../entity/abbildung.entity.js';
import { type Serie } from '../entity/serie.entity.js';
import { type Titel } from '../entity/titel.entity.js';
import { SerieWriteService } from '../service/serie-write.service.js';
import { SerieDTO, SerieDtoOhneRef } from './serieDTO.entity.js';
import { createBaseUri } from './createBaseUri.js';

const MSG_FORBIDDEN = 'Kein Token mit ausreichender Berechtigung vorhanden';
/**
 * Die Controller-Klasse für die Verwaltung von Bücher.
 */
@Controller(paths.rest)
@UseGuards(AuthGuard)
@UseInterceptors(ResponseTimeInterceptor)
@ApiTags('Serie REST-API')
@ApiBearerAuth()
export class SerieWriteController {
    readonly #service: SerieWriteService;

    readonly #logger = getLogger(SerieWriteController.name);

    constructor(service: SerieWriteService) {
        this.#service = service;
    }

    /**
     * Eine neue Serie wird asynchron angelegt. Die neu anzulegende Serie ist als
     * JSON-Datensatz im Request-Objekt enthalten. Wenn es keine
     * Verletzungen von Constraints gibt, wird der Statuscode `201` (`Created`)
     * gesetzt und im Response-Header wird `Location` auf die URI so gesetzt,
     * dass damit die neu angelegte Serie abgerufen werden kann.
     *
     * Falls Constraints verletzt sind, wird der Statuscode `400` (`Bad Request`)
     * gesetzt und genauso auch wenn der Titel oder die ISBN-Nummer bereits
     * existieren.
     *
     * @param serieDTO JSON-Daten für eine Serie im Request-Body.
     * @param req: Request-Objekt von Express für den Location-Header.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    @Post()
    @Roles('admin', 'user')
    @ApiOperation({ summary: 'Eine neue Serie anlegen' })
    @ApiCreatedResponse({ description: 'Erfolgreich neu angelegt' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Seriedaten' })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async post(
        @Body() serieDTO: SerieDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug('post: serieDTO=%o', serieDTO);

        const serie = this.#serieDtoToSerie(serieDTO);
        const id = await this.#service.create(serie);

        const location = `${createBaseUri(req)}/${id}`;
        this.#logger.debug('post: location=%s', location);
        return res.location(location).send();
    }

    /**
     * Zu einer gegebenen Serie wird eine Binärdatei, z.B. ein Bild, hochgeladen.
     * Nest realisiert File-Upload mit POST.
     * https://docs.nestjs.com/techniques/file-upload.
     * Postman: Body mit "form-data", key: "file" und "File" im Dropdown-Menü
     * @param id ID der vorhandenen Serie
     * @param file Binärdatei als `File`-Objekt von _Multer_.
     * @param req: Request-Objekt von Express für den Location-Header.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    // eslint-disable-next-line max-params
    @Post(':id')
    @Public()
    // @Roles({ roles: ['admin']})
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Binärdatei mit einem Bild hochladen' })
    @ApiParam({
        name: 'id',
        description: 'Z.B. 1',
    })
    @ApiCreatedResponse({ description: 'Erfolgreich hinzugefügt' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Datei' })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    @UseInterceptors(FileInterceptor('file'))
    async addFile(
        @Param(
            'id',
            new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
        )
        id: number,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug(
            'addFile: id: %d, originalname=%s, mimetype=%s',
            id,
            file.originalname,
            file.mimetype,
        );

        // TODO Dateigroesse pruefen

        await this.#service.addFile(
            id,
            file.buffer,
            file.originalname,
            file.mimetype,
        );

        const location = `${createBaseUri(req)}/file/${id}`;
        this.#logger.debug('addFile: location=%s', location);
        return res.location(location).send();
    }

    /**
     * Eine vorhandene Serie wird asynchron aktualisiert.
     *
     * Im Request-Objekt von Express muss die ID der zu aktualisierenden Serie
     * als Pfad-Parameter enthalten sein. Außerdem muss im Rumpf das zu
     * aktualisierende Serie als JSON-Datensatz enthalten sein. Damit die
     * Aktualisierung überhaupt durchgeführt werden kann, muss im Header
     * `If-Match` auf die korrekte Version für optimistische Synchronisation
     * gesetzt sein.
     *
     * Bei erfolgreicher Aktualisierung wird der Statuscode `204` (`No Content`)
     * gesetzt und im Header auch `ETag` mit der neuen Version mitgeliefert.
     *
     * Falls die Versionsnummer fehlt, wird der Statuscode `428` (`Precondition
     * required`) gesetzt; und falls sie nicht korrekt ist, der Statuscode `412`
     * (`Precondition failed`). Falls Constraints verletzt sind, wird der
     * Statuscode `400` (`Bad Request`) gesetzt und genauso auch wenn der neue
     * Titel oder die neue ISBN-Nummer bereits existieren.
     *
     * @param serieDTO Seriedaten im Body des Request-Objekts.
     * @param id Pfad-Paramater für die ID.
     * @param version Versionsnummer aus dem Header _If-Match_.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    // eslint-disable-next-line max-params
    @Put(':id')
    @Roles('admin', 'user')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eine vorhandene Serie aktualisieren' })
    @ApiHeader({
        name: 'If-Match',
        description: 'Header für optimistische Synchronisation',
        required: false,
    })
    @ApiNoContentResponse({ description: 'Erfolgreich aktualisiert' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Seriedaten' })
    @ApiPreconditionFailedResponse({
        description: 'Falsche Version im Header "If-Match"',
    })
    @ApiResponse({
        status: HttpStatus.PRECONDITION_REQUIRED,
        description: 'Header "If-Match" fehlt',
    })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async put(
        @Body() serieDTO: SerieDtoOhneRef,
        @Param(
            'id',
            new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
        )
        id: number,
        @Headers('If-Match') version: string | undefined,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug(
            'put: id=%s, serieDTO=%o, version=%s',
            id,
            serieDTO,
            version,
        );

        if (version === undefined) {
            const msg = 'Header "If-Match" fehlt';
            this.#logger.debug('put: msg=%s', msg);
            return res
                .status(HttpStatus.PRECONDITION_REQUIRED)
                .set('Content-Type', 'application/json')
                .send(msg);
        }

        const serie = this.#serieDtoOhneRefToSerie(serieDTO);
        const neueVersion = await this.#service.update({ id, serie, version });
        this.#logger.debug('put: version=%d', neueVersion);
        return res.header('ETag', `"${neueVersion}"`).send();
    }

    /**
     * Eine Serie wird anhand seiner ID-gelöscht, die als Pfad-Parameter angegeben
     * ist. Der zurückgelieferte Statuscode ist `204` (`No Content`).
     *
     * @param id Pfad-Paramater für die ID.
     * @returns Leeres Promise-Objekt.
     */
    @Delete(':id')
    @Roles('admin')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Serie mit der ID löschen' })
    @ApiNoContentResponse({
        description: 'Die Serie wurde gelöscht oder war nicht vorhanden',
    })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async delete(@Param('id') id: number) {
        this.#logger.debug('delete: id=%s', id);
        await this.#service.delete(id);
    }

    #serieDtoToSerie(serieDTO: SerieDTO): Serie {
        const titelDTO = serieDTO.titel;
        const titel: Titel = {
            id: undefined,
            titel: titelDTO.titel,
            untertitel: titelDTO.untertitel,
            serie: undefined,
        };
        const abbildungen = serieDTO.abbildungen?.map((abbildungDTO) => {
            const abbildung: Abbildung = {
                id: undefined,
                beschriftung: abbildungDTO.beschriftung,
                contentType: abbildungDTO.contentType,
                serie: undefined,
            };
            return abbildung;
        });
        const serie = {
            id: undefined,
            version: undefined,
            isbn: serieDTO.isbn,
            rating: serieDTO.rating,
            art: serieDTO.art,
            preis: Decimal(serieDTO.preis),
            rabatt: Decimal(serieDTO.rabatt ?? '0'),
            lieferbar: serieDTO.lieferbar,
            datum: serieDTO.datum,
            homepage: serieDTO.homepage,
            schlagwoerter: serieDTO.schlagwoerter,
            titel,
            abbildungen,
            file: undefined,
            erzeugt: new Date(),
            aktualisiert: new Date(),
        };

        // Rueckwaertsverweise
        serie.titel.serie = serie;
        serie.abbildungen?.forEach((abbildung) => {
            abbildung.serie = serie;
        });
        return serie;
    }

    #serieDtoOhneRefToSerie(serieDTO: SerieDtoOhneRef): Serie {
        return {
            id: undefined,
            version: undefined,
            isbn: serieDTO.isbn,
            rating: serieDTO.rating,
            art: serieDTO.art,
            preis: Decimal(serieDTO.preis),
            rabatt: Decimal(serieDTO.rabatt ?? '0'),
            lieferbar: serieDTO.lieferbar,
            datum: serieDTO.datum,
            homepage: serieDTO.homepage,
            schlagwoerter: serieDTO.schlagwoerter,
            titel: undefined,
            abbildungen: undefined,
            file: undefined,
            erzeugt: undefined,
            aktualisiert: new Date(),
        };
    }
}
/* eslint-enable max-lines */
