export const settings: Record<string, string> = {
  'Could not list microphones: {error}': 'Não foi possível listar os microfones: {error}',
  'Settings saved.': 'Definições guardadas.',
  'Paste a key first.': 'Cole primeiro uma chave.',
  'Key saved and encrypted.': 'Chave guardada e encriptada.',
  'Key removed.': 'Chave removida.',
  'Notes folder: {path}': 'Pasta de notas: {path}',
  'Obsidian vault: {path}': 'Cofre do Obsidian: {path}',
  'Obsidian vault cleared. Exports will ask for a folder.':
    'Cofre do Obsidian limpo. As exportações pedirão uma pasta.',
  'your endpoint': 'o seu endpoint',
  Preferences: 'Preferências',
  Settings: 'Definições',
  'Two keys, one microphone, and a folder. Nothing else leaves your PC.':
    'Duas chaves, um microfone e uma pasta. Nada mais sai do seu PC.',
  'Saving…': 'A guardar…',
  'Save changes': 'Guardar alterações',
  'Demo mode is on. The app uses canned Portuguese transcripts and notes instead of calling Groq or OpenCode.':
    'O modo de demonstração está ativo. A aplicação usa transcrições e notas de exemplo em português em vez de contactar o Groq ou o OpenCode.',
  Listening: 'Escuta',
  'Groq Whisper turns the microphone audio into a Portuguese transcript.':
    'O Groq Whisper converte o áudio do microfone numa transcrição em português.',
  Simulated: 'Simulado',
  Connected: 'Conectado',
  'Key needed': 'Chave necessária',
  'Groq API key': 'Chave de API do Groq',
  'Encrypted with Windows DPAPI. Get a key at':
    'Encriptada com o Windows DPAPI. Obtenha uma chave em',
  '•••••••••••••••• saved': '•••••••••••••••• guardada',
  'Save key': 'Guardar chave',
  Test: 'Testar',
  'Remove Groq key': 'Remover chave do Groq',
  'Whisper model': 'Modelo Whisper',
  'Large v3 is the most accurate for Portuguese. Turbo is faster and cheaper.':
    'O Large v3 é o mais preciso para português. O Turbo é mais rápido e mais barato.',
  'Lecture language': 'Idioma da aula',
  'Live transcript and outline during class':
    'Transcrito e estrutura em direto durante a aula',
  'Uses Groq audio minutes while the lecture runs. Turn it off to stay inside the Groq free tier; the final transcription and notes still run after class.':
    'Consome minutos de áudio do Groq enquanto a aula decorre. Desative-o para se manter dentro do plano gratuito do Groq; a transcrição final e as notas continuam a ser geradas após a aula.',
  'Detect speakers after class (offline)': 'Detetar oradores após a aula (offline)',
  'Labels the lecturer and students in the final transcript. Runs on this PC and adds a few minutes to processing. Needs a one-time {size} MB model download.':
    'Identifica o docente e os estudantes na transcrição final. É executado neste PC e acrescenta alguns minutos ao processamento. Requer uma transferência única de modelos de {size} MB.',
  'The offline speaker runtime is missing. In development, run':
    'O componente de execução offline de identificação de oradores está em falta. Em desenvolvimento, execute',
  'Speaker models are ready. Detection runs entirely on this PC.':
    'Os modelos de oradores estão prontos. A deteção é executada inteiramente neste PC.',
  'Speaker models are not downloaded yet ({size} MB).':
    'Os modelos de oradores ainda não foram transferidos ({size} MB).',
  'Downloading…': 'A transferir…',
  'Download models': 'Transferir modelos',
  'Audio is uploaded to Groq for live and final transcription. Live chunks are billed more heavily than the final pass.':
    'O áudio é enviado para o Groq para transcrição em direto e final. Os fragmentos em direto têm um custo mais elevado do que a passagem final.',
  'Live transcription is off. Only the final lecture audio is sent to Groq, which is much cheaper and fits the free tier better.':
    'A transcrição em direto está desligada. Apenas o áudio final da aula é enviado para o Groq, o que é muito mais barato e se adequa melhor ao plano gratuito.',
  Automation: 'Automação',
  'Let ezNotes start on its own when a scheduled class begins.':
    'Deixe o ezNotes iniciar-se sozinho quando começa uma aula agendada.',
  On: 'Ligado',
  Off: 'Desligado',
  'Start recording automatically when a class begins':
    'Iniciar a gravação automaticamente quando começa uma aula',
  'ezNotes must be running. It uses your weekly schedule and shows a notification before the lecture starts. You can stop or discard the recording as usual.':
    'O ezNotes tem de estar em execução. Usa o seu horário semanal e mostra uma notificação antes do início da aula. Pode parar ou descartar a gravação como habitualmente.',
  'Heads-up notification': 'Notificação prévia',
  'Only used while auto-start is on. Choose Off to start silently.':
    'Só é usada enquanto o início automático está ligado. Escolha Desligado para iniciar em silêncio.',
  '5 minutes before': '5 minutos antes',
  '10 minutes before': '10 minutos antes',
  '15 minutes before': '15 minutos antes',
  'Global recording hotkey': 'Atalho global de gravação',
  'Start or stop a quick recording from any app. Off by default.':
    'Inicie ou pare uma gravação rápida a partir de qualquer aplicação. Desligado por predefinição.',
  Shortcut: 'Atalho',
  'Pick a combination that is free on your machine. If it is taken, ezNotes warns you after saving.':
    'Escolha uma combinação que esteja livre no seu computador. Se estiver ocupada, o ezNotes avisa-o após guardar.',
  'Off by default. Auto-start only applies to classes that begin after ezNotes is running, and only once per class.':
    'Desligado por predefinição. O início automático só se aplica a aulas que comecem depois de o ezNotes estar em execução e apenas uma vez por aula.',
  Writing: 'Escrita',
  'Choose a cloud or local model to turn the transcript into notes.':
    'Escolha um modelo na nuvem ou local para transformar a transcrição em notas.',
  'Local / free': 'Local / gratuito',
  'Groq free tier': 'Plano gratuito do Groq',
  Provider: 'Fornecedor',
  'Groq (free tier)': 'Groq (plano gratuito)',
  'Ollama (local, free)': 'Ollama (local, gratuito)',
  'Custom OpenAI-compatible': 'Personalizado, compatível com OpenAI',
  Model: 'Modelo',
  'Use the provider model ID, for example claude-opus-5-5, gemini-3.8-flash, or gpt-6-astra.':
    'Use o ID de modelo do fornecedor, por exemplo claude-opus-5-5, gemini-3.8-flash ou gpt-6-astra.',
  'Use a Chat Completions model such as DeepSeek, GLM, or Kimi. Native adapters exist for Anthropic, Gemini, and OpenAI Responses.':
    'Use um modelo Chat Completions como DeepSeek, GLM ou Kimi. Existem adaptadores nativos para Anthropic, Gemini e OpenAI Responses.',
  'Base URL': 'URL base',
  'Anthropic base URL; the app calls /v1/messages. Use https://api.anthropic.com (without /v1).':
    'URL base da Anthropic; a aplicação chama /v1/messages. Use https://api.anthropic.com (sem /v1).',
  'Generative Language base URL; the app calls /models/<model>:generateContent.':
    'URL base da Generative Language; a aplicação chama /models/<model>:generateContent.',
  'OpenAI base URL; the app calls /responses.':
    'URL base da OpenAI; a aplicação chama /responses.',
  'The app calls /chat/completions on this URL. No trailing slash needed.':
    'A aplicação chama /chat/completions neste URL. Não é necessária barra final.',
  'No API key needed.': 'Não é necessária chave de API.',
  'Install Ollama on this PC and run': 'Instale o Ollama neste PC e execute',
  'Keep Ollama running while notes are written. Everything stays local.':
    'Mantenha o Ollama em execução enquanto as notas são escritas. Tudo permanece local.',
  'Test local model': 'Testar modelo local',
  'Uses your Groq key.': 'Usa a sua chave do Groq.',
  'No separate notes key is needed. The free tier has daily token limits; shorter lectures work best. For long lectures, Ollama or a paid provider is more reliable.':
    'Não é necessária uma chave separada para as notas. O plano gratuito tem limites diários de tokens; as aulas mais curtas funcionam melhor. Para aulas longas, o Ollama ou um fornecedor pago são mais fiáveis.',
  'Test Groq model': 'Testar modelo Groq',
  'Add a Groq key under Listening first.':
    'Adicione primeiro uma chave do Groq em Escuta.',
  'Notes model key': 'Chave do modelo de notas',
  'Uses your Go subscription. Go is intended for coding-agent traffic, so the Console API is safer for a general app.':
    'Usa a sua subscrição Go. O Go destina-se a tráfego de agentes de programação, pelo que a API Console é mais segura para uma aplicação geral.',
  'Create a service-account key in the OpenCode Console.':
    'Crie uma chave de conta de serviço na OpenCode Console.',
  'Create a key at console.anthropic.com.': 'Crie uma chave em console.anthropic.com.',
  'Create a key in Google AI Studio (aistudio.google.com).':
    'Crie uma chave no Google AI Studio (aistudio.google.com).',
  'Create a key at platform.openai.com.': 'Crie uma chave em platform.openai.com.',
  'Any key accepted by your OpenAI-compatible endpoint.':
    'Qualquer chave aceite pelo seu endpoint compatível com OpenAI.',
  'Remove notes model key': 'Remover chave do modelo de notas',
  'The transcript never leaves this PC when using Ollama. A 7B model is a good fit for a 6 GB GPU.':
    'A transcrição nunca sai deste PC quando usa o Ollama. Um modelo 7B é adequado para uma GPU de 6 GB.',
  'The transcript is sent to Groq to write the note. Groq free-tier token limits apply.':
    'A transcrição é enviada para o Groq para escrever a nota. Aplicam-se os limites de tokens do plano gratuito do Groq.',
  "The transcript is sent to {provider} to write the note. Check that provider's retention policy.":
    'A transcrição é enviada para {provider} para escrever a nota. Verifique a política de retenção desse fornecedor.',
  Storage: 'Armazenamento',
  'Notes are plain Markdown. Audio is kept separately and expires.':
    'As notas estão em Markdown simples. O áudio é guardado separadamente e expira.',
  'Notes folder': 'Pasta de notas',
  Choose: 'Escolher',
  Open: 'Abrir',
  'Delete kept audio after': 'Apagar áudio guardado após',
  'Transcripts and notes are never deleted by retention.':
    'A retenção nunca apaga transcrições nem notas.',
  days: 'dias',
  Microphone: 'Microfone',
  'System default': 'Predefinição do sistema',
  'Microphone {number}': 'Microfone {number}',
  'Request permission and refresh devices': 'Pedir permissão e atualizar dispositivos',
  Refresh: 'Atualizar',
  "Audio files live in the app's private data folder, not in the notes folder. If you keep a recording, it is removed automatically after {days} days.":
    'Os ficheiros de áudio ficam na pasta de dados privada da aplicação, não na pasta de notas. Se guardar uma gravação, esta é removida automaticamente após {days} dias.',
  Exports: 'Exportações',
  'Choose where your Obsidian notes should land.':
    'Escolha onde devem ficar as suas notas do Obsidian.',
  'Obsidian vault': 'Cofre do Obsidian',
  'Not set. The first Obsidian export will ask for a folder.':
    'Não definido. A primeira exportação para o Obsidian pedirá uma pasta.',
  'Choose your vault folder': 'Escolha a pasta do seu cofre',
  'Choose vault': 'Escolher cofre',
  Clear: 'Limpar',
  'Notes are written to': 'As notas são escritas em',
  'with their frontmatter and tags. The path is saved for future exports.':
    'com o frontmatter e as etiquetas. O caminho é guardado para exportações futuras.',
  Appearance: 'Aparência',
  'Choose light, dark, or follow Windows.':
    'Escolha claro, escuro ou siga o Windows.',
  Dark: 'Escuro',
  Light: 'Claro',
  System: 'Sistema',
  'Interface language': 'Idioma da interface',
  'Changes the app interface. Transcripts and notes remain in European Portuguese.':
    'Altera a interface da aplicação. Os transcrições e as notas permanecem em português europeu.',
  English: 'Inglês',
  Português: 'Português',
  Portuguese: 'Português',
  Spanish: 'Espanhol',
  French: 'Francês',
  German: 'Alemão',
  Italian: 'Italiano',
  'Privacy & consent': 'Privacidade e consentimento',
  'What stays local, what leaves, and what you should tell people.':
    'O que fica local, o que sai e o que deve dizer às pessoas.',
  'Stays on this PC': 'Fica neste PC',
  'Audio recordings and transcripts': 'Gravações de áudio e transcrições',
  'Notes and the searchable library': 'Notas e a biblioteca pesquisável',
  'API keys, encrypted with Windows DPAPI': 'Chaves de API, encriptadas com o Windows DPAPI',
  'Leaves this PC': 'Sai deste PC',
  'Audio chunks go to Groq for transcription':
    'Fragmentos de áudio são enviados para o Groq para transcrição',
  'The transcript goes to OpenCode for note writing':
    'A transcrição é enviada para o OpenCode para escrever as notas',
  'No analytics or telemetry from ezNotes': 'Sem análises ou telemetria do ezNotes',
  "Recording a lecture may require consent. Inform the lecturer and follow your institution's rules. ezNotes shows a visible recording indicator.":
    'Gravar uma aula pode exigir consentimento. Informe o docente e cumpra as regras da sua instituição. O ezNotes mostra um indicador de gravação visível.'
,
  'Live outline interval': 'Intervalo do esboço em direto',
  'How often the outline refreshes while the lecture is running.':
    'Com que frequência o esboço é atualizado durante a aula.',
  'Every 60 seconds': 'A cada 60 segundos',
  'Every 90 seconds': 'A cada 90 segundos',
  'Every 2 minutes': 'A cada 2 minutos',
  'Every 3 minutes': 'A cada 3 minutos'
}
