import { Command } from 'commander'
import pkg from '../../package.json'

const program = new Command()

program
  .name('mastermind')
  .description('Local-first markdown review for humans and AI agents — the file is the protocol')
  .version(pkg.version)
  .option('--port <n>', 'port override (default 5173 or next free)')

program
  .command('open')
  .argument('<file>', 'markdown file to open')
  .option('--wait', 'block until the user clicks "Save & hand back", then exit 0')
  .description('start the server if not running and open a browser tab for this file')
  .action(async () => {
    console.error('mastermind open: not implemented yet (M1)')
    process.exit(1)
  })

program
  .command('new')
  .argument('[path]', 'optional path for the new draft')
  .description('create a blank draft and open it')
  .action(async () => {
    console.error('mastermind new: not implemented yet (M11)')
    process.exit(1)
  })

program.parseAsync().catch((err: unknown) => {
  console.error(`mastermind: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
