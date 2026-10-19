/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
      'Creá un archivo .env.local en la raíz del proyecto con esas dos variables ' +
      '(mirá .env.example) y reiniciá "npm run dev".'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
