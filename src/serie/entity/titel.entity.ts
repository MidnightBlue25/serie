// Copyright (C) 2023 - present Juergen Zimmermann, Hochschule Karlsruhe
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

import {
    Column,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Serie } from './serie.entity.js';

@Entity()
export class Titel {
    // https://typeorm.io/entities#primary-columns
    @PrimaryGeneratedColumn()
    id: number | undefined;

    @Column('varchar')
    readonly titel: string | undefined;

    @Column('varchar')
    readonly untertitel: string | undefined;

    @OneToOne(() => Serie, (serie) => serie.titel)
    @JoinColumn({ name: 'serie_id' })
    serie: Serie | undefined;

    public toString = (): string =>
        JSON.stringify({
            id: this.id,
            titel: this.titel,
            untertitel: this.untertitel,
        });
}
