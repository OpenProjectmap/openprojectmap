// Generates schema/project-data.v1.json from the TypeScript types (spec 03 §4).
// Run `pnpm schema` to update the file; a test fails when the checked-in file is out of date.
import { writeFileSync } from 'node:fs';
import { createGenerator } from 'ts-json-schema-generator';

export function generate() {
  const schema = createGenerator({
    path: 'src/core/types.ts',
    tsconfig: 'tsconfig.json',
    type: 'ProjectData',
    skipTypeCheck: true,
  }).createSchema('ProjectData');
  return `${JSON.stringify(
    {
      ...schema,
      $id: 'https://openprojectmap.dev/schema/project-data.v1.json',
      title: 'OpenProjectMap ProjectData v1',
    },
    null,
    2,
  )}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync('schema/project-data.v1.json', generate());
  console.log('wrote schema/project-data.v1.json');
}
