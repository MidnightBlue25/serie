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

import { Cover } from './cover.entity.js';
import { Serie } from './serie.entity.js';
import { SerieFile } from './serieFile.entity.js';
import { Titel } from './titel.entity.js';

// erforderlich in src/config/db.ts und src/serie/serie.module.ts
export const entities = [Cover, Serie, SerieFile, Titel];
