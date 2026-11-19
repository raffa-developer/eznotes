import type { UiLanguage } from '../shared/types'

const PT: Record<string, string> = {
  'Open ezNotes': 'Abrir o ezNotes',
  'Start quick recording': 'Iniciar gravação rápida',
  'Pause recording': 'Pausar gravação',
  'Resume recording': 'Retomar gravação',
  'Stop and write notes': 'Parar e escrever apontamentos',
  'Writing notes…': 'A escrever apontamentos…',
  'Open live lecture': 'Abrir aula em direto',
  'Quit ezNotes': 'Sair do ezNotes',
  ready: 'pronto',
  recording: 'a gravar',
  paused: 'em pausa',
  processing: 'a processar',
  stopped: 'parada',
  error: 'erro',
  'Class starting soon': 'A aula começa em breve',
  '{course} starts soon. ezNotes will start recording automatically.':
    '{course} começa em breve. O ezNotes vai começar a gravar automaticamente.',
  'ezNotes is recording': 'O ezNotes está a gravar',
  'Started automatically for {course}.': 'Iniciado automaticamente para {course}.',
  'Could not start recording automatically: {message}':
    'Não foi possível iniciar a gravação automaticamente: {message}',
  'The global hotkey {key} is already in use by another app.':
    'O atalho global {key} já está a ser usado por outra aplicação.',
  'Could not start the quick recording: {message}':
    'Não foi possível iniciar a gravação rápida: {message}',
  'Could not stop the recording: {message}':
    'Não foi possível parar a gravação: {message}',
  'Low disk space: {mb} MB free. Free some space or stop the recording soon.':
    'Pouco espaço em disco: {mb} MB livres. Liberte espaço ou pare a gravação em breve.',
  'Disk space is critically low ({mb} MB free). The recording was stopped so the audio already captured stays safe.':
    'O espaço em disco está criticamente baixo ({mb} MB livres). A gravação foi parada para que o áudio já captado fique seguro.',
  'Recording could not write to disk: {message}':
    'A gravação não conseguiu escrever no disco: {message}',
  'Quick recording': 'Gravação rápida',
  'Finish this recording first': 'Termine primeiro esta gravação',
  'ezNotes still has a recording open.':
    'O ezNotes ainda tem uma gravação aberta.',
  'Stop the recording and choose what happens to the audio before closing the window.':
    'Pare a gravação e escolha o que fazer com o áudio antes de fechar a janela.',
  'ezNotes is still recording': 'O ezNotes ainda está a gravar',
  'A lecture is in progress.': 'Há uma aula em curso.',
  'If you quit now, the current audio stays on disk but will not be turned into a note.':
    'Se sair agora, o áudio atual fica no disco, mas não será transformado em apontamentos.',
  'Keep running': 'Continuar a executar',
  'Quit anyway': 'Sair mesmo assim',
  'Writing notes in the background': 'A escrever apontamentos em segundo plano',
  'Notes ready': 'Apontamentos prontos',
  'ezNotes keeps working in the tray and will notify you when the note is ready.':
    'O ezNotes continua a trabalhar na bandeja e avisa-o quando os apontamentos estiverem prontos.',
  'Notes ready: {title}': 'Apontamentos prontos: {title}',
  'Notes could not be written': 'Não foi possível escrever os apontamentos',
  'Notes are still being written': 'Os apontamentos ainda estão a ser escritos',
  'ezNotes is finishing the note in the background.':
    'O ezNotes está a terminar os apontamentos em segundo plano.',
  'If you quit now, the recording stays on disk and can be recovered on the next launch.':
    'Se sair agora, a gravação fica no disco e pode ser recuperada no próximo arranque.',
  'Choose where ezNotes saves your notes':
    'Escolha onde o ezNotes guarda as suas notas',
  'Import a calendar': 'Importar um calendário',
  'Choose where to save the backup':
    'Escolha onde guardar a cópia de segurança',
  'Choose the backup folder': 'Escolha a pasta da cópia de segurança',
  'Choose where to restore the notes library':
    'Escolha onde restaurar a biblioteca de notas',
  'Backup created: {path}': 'Cópia de segurança criada: {path}',
  'Backup canceled.': 'Cópia de segurança cancelada.',
  'Restore canceled.': 'Restauração cancelada.',
  'Backup restored to {path}. Your previous notes were left untouched.':
    'Cópia restaurada em {path}. As notas anteriores não foram alteradas.',
  'Choose your Obsidian vault folder':
    'Escolha a pasta do seu cofre Obsidian',
  'Note copied to the clipboard.':
    'Nota copiada para a área de transferência.',
  'Markdown copied. Paste it into a Notion page.':
    'Markdown copiado. Cole numa página do Notion.',
  'Export canceled.': 'Exportação cancelada.',
  'Saved to Obsidian: {path}': 'Guardado no Obsidian: {path}',
  'Markdown exported: {path}': 'Markdown exportado: {path}',
  'PDF exported: {path}': 'PDF exportado: {path}',
  'Study set exported: {path}': 'Conjunto de estudo exportado: {path}',
  'The note view did not finish loading for PDF export.':
    'A vista da nota não terminou de carregar para a exportação em PDF.'
}

export function mainText(
  language: UiLanguage,
  key: string,
  vars?: Record<string, string | number>
): string {
  const template = language === 'pt' ? PT[key] ?? key : key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name])
  )
}
