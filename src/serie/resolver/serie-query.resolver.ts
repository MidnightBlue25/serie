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

import { UseFilters, UseInterceptors } from '@nestjs/common';
import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import Decimal from 'decimal.js'; // eslint-disable-line @typescript-eslint/naming-convention
import { Public } from 'nest-keycloak-connect';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { Serie } from '../entity/serie.entity.js';
import { SerieReadService } from '../service/serie-read.service.js';
import { createPageable } from '../service/pageable.js';
import { type Suchkriterien } from '../service/suchkriterien.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

export type IdInput = {
    readonly id: number;
};

export type SuchkriterienInput = {
    readonly suchkriterien: Suchkriterien;
};

@Resolver('Serie')
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseTimeInterceptor)
export class SerieQueryResolver {
    readonly #service: SerieReadService;

    readonly #logger = getLogger(SerieQueryResolver.name);

    constructor(service: SerieReadService) {
        this.#service = service;
    }

    @Query('serie')
    @Public()
    async findById(@Args() { id }: IdInput) {
        this.#logger.debug('findById: id=%d', id);

        const serie = await this.#service.findById({ id });

        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug(
                'findById: serie=%s, titel=%o',
                serie.toString(),
                serie.titel,
            );
        }
        return serie;
    }

    @Query('serien')
    @Public()
    async find(@Args() input: SuchkriterienInput | undefined) {
        this.#logger.debug('find: input=%o', input);
        const pageable = createPageable({});
        const serienSlice = await this.#service.find(
            input?.suchkriterien,
            pageable,
        );
        this.#logger.debug('find: serienSlice=%o', serienSlice);
        return serienSlice.content;
    }

    @ResolveField('episode')
    episode(@Parent() serie: Serie, short: boolean | undefined) {
        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug(
                'episode: serie=%s, short=%s',
                serie.toString(),
                short,
            );
        }
        // "Nullish Coalescing" ab ES2020
        const episode = serie.episode ?? Decimal(0);
        const shortStr = short === undefined || short ? '%' : 'Prozent';
        return `${episode.toString()} ${shortStr}`;
    }
}
