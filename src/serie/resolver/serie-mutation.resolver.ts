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

// eslint-disable-next-line max-classes-per-file
import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { IsInt, IsNumberString, Min } from 'class-validator';
import Decimal from 'decimal.js'; // eslint-disable-line @typescript-eslint/naming-convention
import { AuthGuard, Roles } from 'nest-keycloak-connect';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { SerieDTO } from '../controller/serieDTO.entity.js';
import { type Abbildung } from '../entity/abbildung.entity.js';
import { type Serie } from '../entity/serie.entity.js';
import { type Titel } from '../entity/titel.entity.js';
import { SerieWriteService } from '../service/serie-write.service.js';
import { type IdInput } from './serie-query.resolver.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

// Authentifizierung und Autorisierung durch
//  GraphQL Shield
//      https://www.graphql-shield.com
//      https://github.com/maticzav/graphql-shield
//      https://github.com/nestjs/graphql/issues/92
//      https://github.com/maticzav/graphql-shield/issues/213
//  GraphQL AuthZ
//      https://github.com/AstrumU/graphql-authz
//      https://www.the-guild.dev/blog/graphql-authz

export type CreatePayload = {
    readonly id: number;
};

export type UpdatePayload = {
    readonly version: number;
};

export class SerieUpdateDTO extends SerieDTO {
    @IsNumberString()
    readonly id!: string;

    @IsInt()
    @Min(0)
    readonly version!: number;
}
@Resolver('Serie')
// alternativ: globale Aktivierung der Guards https://docs.nestjs.com/security/authorization#basic-rbac-implementation
@UseGuards(AuthGuard)
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseTimeInterceptor)
export class SerieMutationResolver {
    readonly #service: SerieWriteService;

    readonly #logger = getLogger(SerieMutationResolver.name);

    constructor(service: SerieWriteService) {
        this.#service = service;
    }

    @Mutation()
    @Roles('admin', 'user')
    async create(@Args('input') serieDTO: SerieDTO) {
        this.#logger.debug('create: serieDTO=%o', serieDTO);

        const serie = this.#serieDtoToSerie(serieDTO);
        const id = await this.#service.create(serie);
        this.#logger.debug('createSerie: id=%d', id);
        const payload: CreatePayload = { id };
        return payload;
    }

    @Mutation()
    @Roles('admin', 'user')
    async update(@Args('input') serieDTO: SerieUpdateDTO) {
        this.#logger.debug('update: serie=%o', serieDTO);

        const serie = this.#serieUpdateDtoToSerie(serieDTO);
        const versionStr = `"${serieDTO.version.toString()}"`;

        const versionResult = await this.#service.update({
            id: Number.parseInt(serieDTO.id, 10),
            serie,
            version: versionStr,
        });
        // TODO BadUserInputError
        this.#logger.debug('updateSerie: versionResult=%d', versionResult);
        const payload: UpdatePayload = { version: versionResult };
        return payload;
    }

    @Mutation()
    @Roles('admin')
    async delete(@Args() id: IdInput) {
        const idStr = id.id;
        this.#logger.debug('delete: id=%s', idStr);
        const deletePerformed = await this.#service.delete(idStr);
        this.#logger.debug('deleteSerie: deletePerformed=%s', deletePerformed);
        return deletePerformed;
    }

    #serieDtoToSerie(serieDTO: SerieDTO): Serie {
        const titelDTO = serieDTO.titel;
        const titel: Titel = {
            id: undefined,
            titel: titelDTO.titel,
            untertitel: titelDTO.untertitel,
            serie: undefined,
        };
        // "Optional Chaining" ab ES2020
        const abbildungen = serieDTO.abbildungen?.map((abbildungDTO) => {
            const abbildung: Abbildung = {
                id: undefined,
                beschriftung: abbildungDTO.beschriftung,
                contentType: abbildungDTO.contentType,
                serie: undefined,
            };
            return abbildung;
        });
        const serie: Serie = {
            id: undefined,
            version: undefined,
            isbn: serieDTO.isbn,
            rating: serieDTO.rating,
            art: serieDTO.art,
            preis: Decimal(serieDTO.preis),
            rabatt: Decimal(serieDTO.rabatt ?? ''),
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

        // Rueckwaertsverweis
        serie.titel!.serie = serie;
        return serie;
    }

    #serieUpdateDtoToSerie(serieDTO: SerieUpdateDTO): Serie {
        return {
            id: undefined,
            version: undefined,
            isbn: serieDTO.isbn,
            rating: serieDTO.rating,
            art: serieDTO.art,
            preis: Decimal(serieDTO.preis),
            rabatt: Decimal(serieDTO.rabatt ?? ''),
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

    // #errorMsgCreateSerie(err: CreateError) {
    //     switch (err.type) {
    //         case 'IsbnExists': {
    //             return `Die ISBN ${err.isbn} existiert bereits`;
    //         }
    //         default: {
    //             return 'Unbekannter Fehler';
    //         }
    //     }
    // }

    // #errorMsgUpdateSerie(err: UpdateError) {
    //     switch (err.type) {
    //         case 'SerieNotExists': {
    //             return `Es gibt keine Serie mit der ID ${err.id}`;
    //         }
    //         case 'VersionInvalid': {
    //             return `"${err.version}" ist keine gueltige Versionsnummer`;
    //         }
    //         case 'VersionOutdated': {
    //             return `Die Versionsnummer "${err.version}" ist nicht mehr aktuell`;
    //         }
    //         default: {
    //             return 'Unbekannter Fehler';
    //         }
    //     }
    // }
}
