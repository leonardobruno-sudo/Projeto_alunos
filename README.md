# SGAC — Sistema de Gerenciamento de Alunos Cotistas

O SGAC é uma aplicação web para acompanhar estudantes cotistas com segurança e clareza. Ele reúne cadastro, desempenho acadêmico, boletim, estatísticas, diário de turma, calendário, documentos e um assistente de consulta. A interface é React com TypeScript; a API é Node.js com Express; os dados ficam em um banco SQLite local.

Em termos simples: cada pessoa entra com sua própria conta, vê somente aquilo que pode ver e encontra as informações acadêmicas organizadas para seu papel. O navegador nunca acessa o banco diretamente. Toda consulta ou alteração passa pela API, que confere a sessão e as permissões antes de responder.

> Situação importante: o SGAC é inspirado em fluxos acadêmicos como os do SUAP, mas não possui integração automática ou login compartilhado com o SUAP. Os dados são mantidos no banco SQLite da própria instalação.

## Sumário

- [O que mudou nesta versão](#o-que-mudou-nesta-versão)
- [Como o sistema funciona para cada pessoa](#como-o-sistema-funciona-para-cada-pessoa)
- [Arquitetura](#arquitetura)
- [Diagrama de casos de uso](#diagrama-de-casos-de-uso)
- [Perfis e permissões](#perfis-e-permissões)
- [Áreas do sistema](#áreas-do-sistema-em-linguagem-simples-e-técnica)
- [Dados acadêmicos](#dados-acadêmicos-períodos-e-indicadores)
- [Modelo entidade-relacionamento](#modelo-entidade-relacionamento)
- [Organização do código](#organização-do-código)
- [API, DTOs e controladores](#api-dtos-e-controladores)
- [Instalação e execução](#instalação-e-execução)
- [Segurança, privacidade e acessibilidade](#segurança-privacidade-e-acessibilidade)
- [Testes e colaboração](#testes-e-colaboração)
- [Limites conhecidos](#limites-conhecidos-e-manutenção)

## O que mudou nesta versão

O nome do produto foi consolidado como **SGAC — Sistema de Gerenciamento de Alunos Cotistas**. Além disso, o sistema recebeu uma organização clara entre interface, servidor, regras de negócio e banco de dados.

- A interface React foi separada da API Express em apps/web e apps/api.
- O assistente SGAC passou a ter um controlador de comandos próprio, independente da interface, e consulta somente dados já autorizados para a sessão.
- Foram acrescentados DTOs para validar e transportar dados de alunos e do chat sem deixar a interface depender diretamente das tabelas do banco.
- O aluno encontra as matérias em formato de boletim, com seleção de período e sem filtros de nome ou matrícula desnecessários para a própria conta.
- Estatísticas receberam filtros por nome para perfis administrativos, gráficos mais acessíveis e um gráfico de setores SVG circular. Na média por matéria, os setores mostram percentuais; o total não ocupa o centro do gráfico.
- A área do aluno não mostra o gráfico de faixas de nota nem uma lista redundante de alunos. Essas visões continuam disponíveis para os perfis de gestão.
- Notas e faltas em risco aparecem em vermelho; valores sem risco usam a cor institucional. O destaque visual não transforma alertas em risco.
- O cadastro de aluno cria uma credencial temporária aleatória, exibida uma única vez ao gestor autorizado e obrigatoriamente alterada pelo aluno no primeiro acesso.
- Todos os perfis podem enviar, trocar ou remover a própria foto de perfil em Configurações.
- A exportação CSV é exclusiva de Admin. Professor não cadastra aluno e só pode editar sua disciplina atribuída.
- A área Vida acadêmica registra calendário, eventos, diários, matrículas em diário, aulas, frequência, avaliações, notas, requerimentos e documentos acadêmicos.
- As regras de diário exigem professor responsável compatível com curso, turma e disciplina. Um professor só lança dados no diário formalmente atribuído a ele.
- Mudanças que poderiam descaracterizar um calendário ou diário já usado são bloqueadas pelo servidor, preservando a consistência dos registros lançados.

## Como o sistema funciona para cada pessoa

| Pessoa | Explicação em linguagem simples | O que o sistema verifica tecnicamente |
| --- | --- | --- |
| Aluno | Vê apenas seu boletim, matérias, frequência, vida acadêmica, documentos e requerimentos. Pode baixar o próprio boletim em PDF, trocar senha e foto. | A matrícula vem da sessão autenticada; a API ignora qualquer tentativa de informar a matrícula de outra pessoa. O aluno só lê diários em que possui matrícula ativa. |
| Professor | Vê estudantes do curso, turma e disciplina atribuída. Atualiza somente a própria matéria no fluxo legado e lança aulas, frequência e notas no diário designado. | Curso, turma, disciplina e, no diário, o identificador da conta do professor são conferidos no servidor. Ter a mesma disciplina que outro professor não basta para editar o diário dele. |
| Coordenador | Acompanha e edita dados acadêmicos existentes do próprio curso, organiza calendário e diários e acompanha requerimentos/documentos do curso. | O escopo é comparado com o curso salvo na sessão. Não recebe privilégios globais, cadastro manual de aluno, CSV administrativo, gestão de usuários ou backup. |
| Diretor | Gerencia estudantes do próprio curso, inclusive cadastro manual, movimentação e exclusão dentro do escopo, além da operação acadêmica do curso. | As mesmas regras de curso são aplicadas em toda rota protegida. CSV, usuários e backup continuam fora desse perfil. |
| Admin | Administra todos os cursos, contas de equipe, permissões, CSV, backups, períodos históricos e a operação acadêmica completa. | Possui escopo global, mas ainda passa por validação de sessão, entrada e regras de integridade. |

Essa divisão não depende apenas de esconder botões. A interface reduz opções que não fazem sentido para cada pessoa, mas a proteção real acontece na API. Se alguém tentar chamar uma URL manualmente, o servidor aplica as mesmas regras e devolve acesso negado quando necessário.

## Arquitetura

~~~mermaid
flowchart TB
    Pessoa["Pessoa autenticada<br/>Aluno, Professor, Coordenador, Diretor ou Admin"]
    Web["React + TypeScript<br/>apps/web"]
    Api["Express + Node.js<br/>apps/api"]
    Auth["Autenticação, sessão<br/>e permissões"]
    Students["Módulo de alunos<br/>DTOs e regras de risco"]
    Academic["Módulo Vida Acadêmica<br/>calendário, diário, frequência e notas"]
    Chat["Assistente SGAC<br/>controlador de comandos"]
    Db[("SQLite<br/>database/escola.db")]
    LocalModel["Modelo local opcional<br/>Ollama em 127.0.0.1"]

    Pessoa --> Web
    Web -->|"HTTP: /api"| Api
    Api --> Auth
    Auth --> Students
    Auth --> Academic
    Auth --> Chat
    Students --> Db
    Academic --> Db
    Chat -->|"somente leituras autorizadas"| Students
    Chat -.->|"redação opcional, sem ferramentas"| LocalModel
~~~

### Leitura humana

Pense na interface React como a recepção: ela mostra telas, formulários, tabelas e gráficos. A API é a equipe que confere se a pessoa pode entrar em cada área e registra as ações. O SQLite é o arquivo organizado onde os dados ficam guardados. O assistente não ganha uma chave extra para esse arquivo: ele pede ao mesmo controle de permissões uma visão já filtrada, somente para leitura.

### Leitura técnica

O React consome contratos HTTP em /api. A sessão é mantida pelo Express em cookie HTTP-only; os módulos de alunos, IA e Vida Acadêmica executam validações antes de usar helpers de banco. A aplicação cliente não recebe SQL nem credenciais. O modelo local, quando configurado, recebe somente um contexto reduzido e autorizado; ele não tem ferramentas para buscar, criar, atualizar ou excluir dados.

## Diagrama de casos de uso

O diagrama abaixo representa as principais interações já implementadas. Ele usa um fluxograma Mermaid para continuar visível diretamente no GitHub.

~~~mermaid
flowchart LR
    Aluno([Aluno])
    Professor([Professor])
    Coordenador([Coordenador])
    Diretor([Diretor])
    Admin([Admin])

    subgraph SGAC["SGAC"]
        Login([Entrar, trocar senha e configurar foto])
        ViewOwn([Consultar boletim, matérias e vida acadêmica própria])
        Request([Criar e acompanhar requerimento])
        Dashboard([Consultar dashboard e estatísticas do escopo])
        Subject([Editar somente a disciplina atribuída])
        Diary([Lançar aulas, frequência e notas no diário atribuído])
        Calendar([Organizar calendário, eventos e diários])
        Enrollment([Matricular alunos em diário])
        Students([Cadastrar, editar, mover ou excluir alunos do escopo])
        Csv([Importar ou exportar CSV])
        Users([Gerir contas, permissões e backup])
        History([Salvar snapshots de períodos])
        Chat([Consultar o assistente SGAC em modo leitura])
    end

    Aluno --> Login
    Aluno --> ViewOwn
    Aluno --> Request
    Aluno --> Chat

    Professor --> Login
    Professor --> Dashboard
    Professor --> Subject
    Professor --> Diary
    Professor --> Chat

    Coordenador --> Login
    Coordenador --> Dashboard
    Coordenador --> Calendar
    Coordenador --> Enrollment
    Coordenador --> Chat

    Diretor --> Login
    Diretor --> Dashboard
    Diretor --> Calendar
    Diretor --> Enrollment
    Diretor --> Students
    Diretor --> Chat

    Admin --> Login
    Admin --> Dashboard
    Admin --> Calendar
    Admin --> Enrollment
    Admin --> Students
    Admin --> Csv
    Admin --> Users
    Admin --> History
    Admin --> Chat
~~~

O caso de uso “editar matéria” é deliberadamente separado de “editar cadastro”. O professor não abre o cadastro completo do estudante: ele trabalha apenas na matéria sob sua responsabilidade. Calendário, matrícula em diário e atribuição de professor ficam com Administração, Direção ou Coordenação.

## Perfis e permissões

| Recurso | Aluno | Professor | Coordenador | Diretor | Admin |
| --- | :---: | :---: | :---: | :---: | :---: |
| Ver o próprio boletim e PDF | Sim | — | — | — | — |
| Ver estudantes do escopo | Próprio | Curso, turma e disciplina | Curso | Curso | Todos |
| Cadastro manual de aluno | Não | Não | Não | Sim, no curso | Sim |
| Editar cadastro completo | Não | Não | Sim, no curso | Sim, no curso | Sim |
| Excluir aluno | Não | Não | Não | Sim, no curso | Sim |
| Editar matéria legada | Não | Só a disciplina atribuída | Sim, no curso | Sim, no curso | Sim |
| Criar calendário e diário | Não | Não | Sim, no curso | Sim, no curso | Sim |
| Matricular aluno em diário | Não | Não | Sim, no curso | Sim, no curso | Sim |
| Lançar aula, frequência e nota no diário | Não | Só diário atribuído | Sim, no curso | Sim, no curso | Sim |
| CSV | Não | Não | Não | Não | Sim |
| Gestão de usuários e permissões | Não | Não | Não | Não | Sim |
| Backup e snapshot de período | Não | Não | Não | Não | Sim |
| Assistente em leitura | Próprio | Escopo docente | Curso | Curso | Global |

“Escopo” significa o recorte autorizado dos dados. Por exemplo, um Diretor não edita estudante de outro curso, e um Professor não pode usar a URL de outro diário para registrar frequência.

## Áreas do sistema, em linguagem simples e técnica

### 1. Login, senha e sessão

**Em linguagem simples.** A pessoa entra com usuário e senha. Se a conta de aluno acabou de ser criada, ela recebe uma senha temporária e precisa trocá-la antes de abrir o sistema. Isso evita que uma senha inicial continue sendo usada por tempo indeterminado.

**Tecnicamente.** As senhas são armazenadas com hash bcrypt, nunca em texto puro. O login cria uma sessão no servidor, associada a um cookie HTTP-only, com duração configurada de uma hora. O login limita tentativas inválidas por IP e identificador. Contas antigas com senha inicial legada são marcadas para troca obrigatória.

### 2. Dashboard, estudantes e cadastro

**Em linguagem simples.** O dashboard mostra a lista de alunos que a pessoa pode acompanhar e um resumo do período. Um aluno vê apenas o próprio acompanhamento; os demais perfis veem o recorte permitido por curso, turma ou disciplina. Cadastros podem ser criados, revisados, movimentados e, quando o perfil permite, excluídos com confirmação na interface.

**Tecnicamente.** As rotas de alunos usam paginação, filtros, ordenação e validação no servidor. As funções de permissão são aplicadas em consultas e alterações; filtros enviados pela interface não ampliam o resultado. A matrícula é normalizada e possui índice único sem diferenciar maiúsculas de minúsculas. Ao excluir uma matrícula, a conta de aluno vinculada é revogada, enquanto snapshots históricos permanecem preservados.

### 3. Matérias e boletim

**Em linguagem simples.** O aluno abre um boletim com todas as matérias reunidas em tabela, escolhe o período e sabe se está vendo o dado atual ou um retrato histórico salvo. Não precisa procurar por nome ou matrícula, porque o sistema já sabe quem está logado. O boletim pode ser baixado em PDF pelo próprio aluno.

**Tecnicamente.** A tela de aluno consulta a matrícula da sessão e usa o contrato individual com período e fonte. Para outros perfis, a tela de Matérias mantém filtros autorizados. Professor recebe somente sua disciplina no retorno da API, inclusive em estatísticas e dashboard; os campos brutos das outras matérias são retirados da resposta.

Notas abaixo de 70 entram em risco e faltas de 25% ou mais entram em risco no acompanhamento legado. Em ambas as situações, a situação consolidada é **Em Risco**. A interface usa vermelho apenas para esse estado de risco; valores não em risco permanecem na cor institucional. Alertas continuam identificados como alerta, sem serem apresentados como risco.

### 4. Estatísticas e gráficos

**Em linguagem simples.** A página transforma os registros permitidos em indicadores fáceis de comparar: situação acadêmica, faltas, médias por matéria e evolução por período. Perfis de Professor em diante podem filtrar alunos pelo nome dentro do próprio escopo. O aluno não vê gráficos coletivos que seriam redundantes ou mostrariam comparações desnecessárias.

**Tecnicamente.** Os agregados são calculados no servidor a partir de alunos já filtrados por permissão. A interface oferece gráficos de barras, colunas, linhas, área e setores. O gráfico de setores é SVG, com arcos calculados a partir dos valores; na média por matéria, rótulos de percentual são mostrados nos setores quando há espaço e a legenda permanece como alternativa acessível. As informações textuais do gráfico também ficam disponíveis para leitores de tela.

### 5. Vida acadêmica

**Em linguagem simples.** Esta área é o diário organizado do período. A gestão pode criar calendário, marcar eventos, abrir um diário para uma turma e atribuir o professor responsável. O professor designado registra aulas, presença e avaliações. O aluno consulta apenas aquilo em que está matriculado: matérias, frequência, notas, documentos e requerimentos.

**Tecnicamente.** A Vida Acadêmica é um módulo aditivo e normalizado. Ela usa tabelas próprias para diário, aula, frequência e avaliação, em vez de gravar tudo em um único campo JSON. Cada rota está em /api/vida-academica, exige sessão e chama um serviço que revalida escopo e regra de negócio. A tabela de matrícula em diário impede que um aluno seja exposto a diários fora de sua turma/curso; o responsável do diário é validado por identidade de usuário, não apenas por texto de disciplina.

Mudanças que poderiam descaracterizar dados já lançados são bloqueadas: não é possível mudar o escopo de um diário que já tenha matrícula, aula ou avaliação, nem mudar o escopo ou intervalo de calendário de forma que descaracterize eventos existentes. Diários fechados não aceitam novos lançamentos.

### 6. Frequência, avaliações e notas do diário

**Em linguagem simples.** Antes de informar presença, alguém registra a aula. Depois, o professor marca cada estudante como presente, falta ou falta justificada. Avaliações têm nota máxima e peso; a nota pode ser lançada ou corrigida no mesmo registro. Se ainda faltam presenças para alguma aula, o sistema não finge que a frequência está completa.

**Tecnicamente.** Uma frequência é única por par aula–matrícula, e uma nota é única por par avaliação–matrícula. A API confirma matrícula ativa no diário, diário aberto e nota dentro do intervalo permitido. O resumo de frequência do diário é calculado no servidor: fica indisponível se nem todas as aulas tiverem registro, alerta a partir de 20% de faltas e risco a partir de 25%. Faltas justificadas são mantidas separadamente.

### 7. Calendário, requerimentos e documentos

**Em linguagem simples.** Calendários ajudam a deixar o período visível para a turma. Eventos podem ter data de início e fim. O aluno pode abrir um requerimento ligado ao período que está consultando e acompanhar sua situação. Documentos aparecem como registros acadêmicos disponíveis para o perfil.

**Tecnicamente.** Calendários e eventos possuem curso, turma opcional, período e intervalo validado. Requerimentos têm status controlado: ABERTO, EM_ANALISE, CONCLUIDO ou INDEFERIDO. Documentos usam metadados, período opcional, status e uma referência externa; o módulo não finge armazenar arquivo institucional quando só existe uma referência. Registros antigos sem período continuam visíveis como registros gerais.

### 8. Assistente SGAC

**Em linguagem simples.** O botão “Assistente SGAC” fica na barra lateral. Ele ajuda com comandos como “meus dados”, “buscar nome: Ana”, “alunos em risco” e perguntas de orientação do sistema. Ele nunca faz alterações em nome da pessoa: para mudar nota, matrícula ou cadastro, a pessoa usa a tela apropriada.

**Tecnicamente.** O controlador de comandos reconhece um conjunto fechado de intenções de leitura e usa somente helpers de banco que já aplicam permissão. Os dados repassados ao chat são reduzidos por whitelist: não incluem senha, telefone, descrição ou JSON bruto de matérias. O DTO do chat valida a mensagem de entrada e o controlador HTTP devolve um contrato reduzido. Sem modelo local, o sistema responde por regras e base de conhecimento revisada. Com Ollama opcional, o modelo apenas reformula o contexto autorizado, sem ferramentas, sem acesso ao banco e sem envio para serviços remotos.

### 9. Configurações, foto e acessibilidade

**Em linguagem simples.** Cada pessoa pode ajustar contraste, tamanho do texto, redução de movimento, tema, senha e foto. A foto é pessoal: outra conta não pode pedir a imagem usando a própria sessão.

**Tecnicamente.** A foto aceita JPEG, PNG ou WebP válidos, com até 2 MB, e é guardada no perfil do usuário. A rota de leitura é autenticada e responde com cache privado. Preferências visuais ficam no armazenamento local do navegador, pois não são dados acadêmicos. A navegação inclui link de pular para conteúdo, rótulos acessíveis, foco em diálogos e alternativas textuais para gráficos.

## Dados acadêmicos, períodos e indicadores

O SGAC trabalha com duas camadas de dados acadêmicos que coexistem de propósito:

1. **Cadastro acadêmico consolidado:** dados da tabela alunos, incluindo matérias, nota final, total de aulas, faltas e indicadores usados pelos dashboards, boletim legado, filtros e snapshots.

2. **Vida Acadêmica normalizada:** diário de turma, matrícula no diário, aulas, frequência por aula, avaliações e notas por avaliação.

### Por que existem duas camadas?

Em linguagem simples, o sistema já possuía histórico de matérias e indicadores que precisava continuar funcionando. A nova área de Vida Acadêmica foi adicionada como um caderno de registros mais detalhado, sem apagar aquilo que já existia. Assim, relatórios e telas anteriores não quebram quando o diário passa a registrar uma aula de cada vez.

Tecnicamente, o schema de Vida Acadêmica é criado e atualizado em apps/api/src/modules/academic-life/academicLifeSchema.js; ele não reescreve o campo materias_json dos alunos. Criar diário ou lançar presença não altera silenciosamente o JSON legado. Quando a regra de negócio desejar consolidar as duas camadas no futuro, isso deve ser uma integração explícita e testada, nunca efeito colateral de uma tela.

### Períodos e fonte de consulta

Os períodos disponíveis são Bimestre 1 a 4 e Semestre 1 a 2. Para dados consolidados, a interface permite escolher:

- **Dados atuais:** o registro vivo de aluno, usado para acompanhamento do momento.

- **Snapshot do período:** uma cópia salva por Admin para auditoria e consulta histórica.

O snapshot não é atualizado por acidente. A rota administrativa de histórico informa se uma cópia já existe e exige confirmação explícita para sobrescrever. Assim, a pessoa sabe se está olhando para o presente ou para o retrato de um período encerrado.

## Modelo entidade-relacionamento

O diagrama mostra as entidades centrais. Relações com matrícula no cadastro legado e histórico são indicadas como relações lógicas quando não são chaves estrangeiras físicas; as relações da Vida Acadêmica possuem chaves estrangeiras no SQLite.

~~~mermaid
erDiagram
    USUARIOS {
        int id PK
        string username UK
        string role
        string matricula
        string curso
        string disciplina
        string turma
        boolean must_change_password
    }

    ALUNOS {
        string matricula PK
        string nome
        string curso
        string turma
        string materias_json
        float nota_final
        float taxa_faltas
        int total_aulas
    }

    HISTORICO_ACADEMICO {
        string matricula PK
        int periodo PK
        string snapshot_json
        datetime salvo_em
    }

    CALENDARIOS_ACADEMICOS {
        int id PK
        string curso
        string turma
        int periodo
        date inicio_em
        date fim_em
    }

    EVENTOS_ACADEMICOS {
        int id PK
        int calendario_id FK
        string tipo
        date inicio_em
        date fim_em
    }

    DIARIOS_TURMA {
        int id PK
        string curso
        string turma
        string disciplina
        int periodo
        int professor_usuario_id FK
        string status
    }

    MATRICULAS_DIARIO {
        int id PK
        int diario_id FK
        string matricula FK
        boolean ativa
    }

    AULAS_DIARIO {
        int id PK
        int diario_id FK
        date data_aula
        string titulo
        float carga_horaria
    }

    FREQUENCIAS_AULA {
        int id PK
        int aula_id FK
        string matricula FK
        string situacao
    }

    AVALIACOES_DIARIO {
        int id PK
        int diario_id FK
        string titulo
        date data_avaliacao
        float peso
        float nota_maxima
    }

    NOTAS_AVALIACAO {
        int id PK
        int avaliacao_id FK
        string matricula FK
        float nota
    }

    REQUERIMENTOS_ACADEMICOS {
        int id PK
        string matricula FK
        int periodo
        string status
    }

    DOCUMENTOS_ACADEMICOS {
        int id PK
        string matricula FK
        int periodo
        string status
        string referencia_externa
    }

    USUARIOS o|--o{ DIARIOS_TURMA : responsavel
    USUARIOS o|--o{ CALENDARIOS_ACADEMICOS : cria
    CALENDARIOS_ACADEMICOS ||--o{ EVENTOS_ACADEMICOS : contem
    DIARIOS_TURMA ||--o{ MATRICULAS_DIARIO : recebe
    ALUNOS ||--o{ MATRICULAS_DIARIO : participa
    DIARIOS_TURMA ||--o{ AULAS_DIARIO : registra
    AULAS_DIARIO ||--o{ FREQUENCIAS_AULA : tem
    ALUNOS ||--o{ FREQUENCIAS_AULA : possui
    DIARIOS_TURMA ||--o{ AVALIACOES_DIARIO : tem
    AVALIACOES_DIARIO ||--o{ NOTAS_AVALIACAO : recebe
    ALUNOS ||--o{ NOTAS_AVALIACAO : recebe
    ALUNOS ||--o{ REQUERIMENTOS_ACADEMICOS : abre
    ALUNOS ||--o{ DOCUMENTOS_ACADEMICOS : possui
    ALUNOS ||--o{ HISTORICO_ACADEMICO : snapshot
    ALUNOS o|--o| USUARIOS : conta_aluno
~~~

### Como ler o diagrama

- Um **diário** representa uma disciplina para uma turma em um período e tem, no máximo, um professor responsável.
- Uma **matrícula em diário** liga um aluno a esse diário. Ela permite ao aluno ver aulas, frequência e avaliações daquela disciplina.
- Uma **aula** gera vários registros de frequência, um por aluno matriculado.
- Uma **avaliação** gera várias notas, uma por aluno matriculado.
- Calendários e eventos formam uma linha do tempo do curso ou turma.
- Requerimentos e documentos pertencem a uma matrícula, podendo também estar vinculados a um período.
- A conta de aluno e o cadastro de aluno compartilham a matrícula de forma controlada. O banco garante unicidade para conta de aluno; o relacionamento é tratado pela aplicação para manter compatibilidade com o schema legado.

## Organização do código

~~~text
apps/
  api/
    src/
      lib/                    Banco, sessão, autenticação, permissões e utilitários
      modules/
        students/             DTO, controlador e serviço de estudantes
        ai/                   Chat DTO, controlador de comandos, serviço e base local
        academic-life/        Schema e regras de calendário, diário e lançamentos
      routes/                 Rotas HTTP de autenticação, API e Vida Acadêmica
      scripts/                Criação de Admin e inicialização rápida
    test/                     Testes Node.js de regras, escopo e migrações
  web/
    src/
      components/             Componentes visuais reutilizáveis e gráficos
      features/
        academics/            Visão e gerenciamento da Vida Acadêmica
        chat/                 Gaveta do Assistente SGAC
      pages/                  Dashboard, matérias, cadastro e configurações
      utils/                  Cliente HTTP, fontes de dados e PDF
      types.ts                Tipos e capacidades da interface
database/
  .gitkeep                    Mantém a pasta; o SQLite local não é versionado
.github/workflows/ci.yml      Teste, lint e build automatizados
ACCESSIBILITY.md              Critérios e referências de acessibilidade
CONTRIBUTING.md               Fluxo de colaboração e branches
QUICKSTART.md                 Instalação inicial resumida
~~~

### Separação de responsabilidades

| Camada | Responsabilidade | Não deve fazer |
| --- | --- | --- |
| React em apps/web | Mostrar telas, coletar ações, apresentar mensagens e consumir a API | Fazer SQL, decidir sozinho a permissão ou guardar senha |
| Rotas Express | Receber HTTP, exigir sessão, validar formato e devolver respostas consistentes | Concentrar toda regra de negócio complexa |
| Módulos e serviços | Aplicar regras de aluno, IA e Vida Acadêmica | Confiar em curso, matrícula ou papel enviados pelo navegador |
| Biblioteca em src/lib | Sessão, criptografia, permissão, banco e helpers compartilhados | Renderizar componentes React |
| SQLite | Persistir cadastros, contas, snapshots e registros normalizados | Decidir o que cada usuário pode ver sem a camada de autorização |

## API, DTOs e controladores

### O que são DTOs neste projeto?

DTO significa “objeto de transferência de dados”. É uma forma de combinar claramente o que a interface pode enviar e receber. Para quem não é da área: é como um formulário padronizado que impede que um pedido incompleto ou com campos indevidos chegue ao arquivo da escola.

No SGAC, exemplos importantes são:

- apps/api/src/modules/students/student.dto.js valida busca e paginação de estudantes.
- apps/api/src/modules/ai/chatDto.js valida a mensagem enviada ao assistente.
- apps/web/src/features/academics/academicApiTypes.ts descreve o contrato que a tela React espera da Vida Acadêmica.
- apps/web/src/features/students/student.dto.ts mantém conversão e tipagem dos dados usados pela interface.

### O que são controladores?

Controladores recebem a solicitação, verificam seu formato e encaminham para a regra certa. Eles funcionam como uma recepção organizada: não decidem arbitrariamente quem pode acessar dados, mas garantem que o pedido chegue ao serviço correto com os dados válidos.

- student.controller.js coordena a listagem paginada de estudantes.
- chatController.js valida a mensagem do chat e retorna somente a resposta pública permitida.
- commandController.js interpreta comandos de leitura do assistente e pede dados já filtrados por permissão.
- academicLife.service.js concentra regras de escopo e integridade para calendário, diário, aula, frequência, avaliação, nota, requerimento e documento.

### Principais grupos de rota

| Grupo | Exemplos | Finalidade |
| --- | --- | --- |
| Autenticação | /api/auth/login, /api/auth/me, /api/auth/password, /api/auth/profile/photo | Sessão, senha e foto de perfil |
| Estudantes | /api/alunos, /api/alunos/:matricula, /api/alunos/:matricula/materias/:subject | Cadastro, consulta, edição autorizada e matéria do professor |
| Administração | /api/alunos/importar, /api/alunos/modelo.csv, /api/usuarios, /api/backup | CSV, contas de equipe, permissões e backup, conforme perfil |
| Períodos e estatísticas | /api/periodos, /api/periodos/:periodo/historico, /api/estatisticas | Fonte histórica, snapshots e indicadores |
| Vida Acadêmica | /api/vida-academica/* | Calendários, eventos, diários, matrículas, aulas, frequência, avaliações, notas, documentos e requerimentos |
| Pesquisa PIPAD | /api/pesquisa/* | Perfis de coorte, respostas consentidas, entrevistas, versões experimentais do indicador e exportação pseudonimizada; restrito a Admin |
| Assistente | /api/chat | Consultas orientadas e somente de leitura no escopo da sessão |

Todas as rotas de dados exigem sessão válida. O servidor responde com mensagens de erro controladas e não considera um parâmetro vindo da interface como prova de autorização.

## Instalação e execução

### Pré-requisitos

- Node.js 22.12.0 ou compatível com ^20.19.0 ou >=22.12.0.
- npm.
- Windows, macOS ou Linux para execução local.

### Primeira instalação

~~~powershell
npm install
npm --prefix apps/web install
~~~

O clone não inclui dados acadêmicos, sessões, backup nem fotos de perfil. Na primeira execução, o banco local será criado em database/escola.db.

### Criar o primeiro administrador

Em um banco vazio, defina as credenciais apenas na sessão atual do terminal:

~~~powershell
$env:INITIAL_ADMIN_USERNAME = 'admin-local'
$env:INITIAL_ADMIN_PASSWORD = 'troque-por-uma-senha-forte'
$env:INITIAL_ADMIN_NAME = 'Administrador local'
npm run create:admin
~~~

Não registre essa senha em arquivos versionados, commits, capturas de tela ou tickets.

### Abrir o sistema

~~~powershell
npm run quickstart
~~~

Esse comando compila o React, inicia o Express e abre a URL informada pelo servidor. Mantenha o terminal aberto enquanto utiliza o SGAC. Para encerrar, use Ctrl+C.

### Desenvolvimento com interface e API separadas

Em um terminal:

~~~powershell
npm run dev
~~~

Em outro terminal:

~~~powershell
npm run client:dev
~~~

O Vite encaminha chamadas iniciadas por /api para http://localhost:3000 durante o desenvolvimento. A URL da interface é mostrada pelo próprio Vite.

### Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| DATABASE_PATH | Caminho absoluto alternativo do arquivo SQLite |
| PORT | Porta preferencial do Express; o padrão é 3000 |
| NODE_ENV | Use production em ambiente produtivo |
| SESSION_SECRET | Obrigatória em produção; protege a sessão |
| INITIAL_ADMIN_USERNAME | Usuário do primeiro Admin |
| INITIAL_ADMIN_PASSWORD | Senha do primeiro Admin |
| INITIAL_ADMIN_NAME | Nome exibido do primeiro Admin |
| LOCAL_AI_MODEL | Nome do modelo Ollama local, opcional |
| LOCAL_AI_URL | Endpoint local do Ollama, opcional; só aceita host local HTTP |

Para ativar a redação opcional por modelo local:

~~~powershell
ollama pull qwen2.5:3b
$env:LOCAL_AI_MODEL = 'qwen2.5:3b'
npm run dev
~~~

Sem Ollama, o assistente continua funcionando por respostas determinísticas e orientações revisadas.

### Implantação na Vercel

O projeto inclui `vercel.json` e um handler em `api/index.js`. Configure no painel da Vercel:

- `SESSION_SECRET`: segredo aleatório forte e obrigatório.
- `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD` e `INITIAL_ADMIN_NAME`: opcionais para criar o primeiro administrador na primeira inicialização.
- `NODE_ENV=production`.

Na implantação, o SQLite usa um diretório temporário da função da Vercel. Dados e sessões podem ser perdidos entre reinicializações ou réplicas. Portanto, esta configuração permite publicar e demonstrar o frontend, mas não representa uma implantação institucional persistente. Para produção, migre o banco e o armazenamento de sessão para um serviço persistente compartilhado.

## Segurança, privacidade e acessibilidade

### Segurança e privacidade

- Senhas usam hash bcrypt; senhas temporárias são aleatórias, exibidas uma vez e exigem troca.
- Sessões são guardadas no servidor, com cookie HTTP-only, SameSite=Lax e secure em produção.
- Requisições de alteração com origem diferente são recusadas pela API.
- A fotografia de perfil é privada e exige sessão autenticada para leitura, atualização ou remoção.
- A API confere papel, curso, turma, disciplina, matrícula em diário e identidade do professor no servidor.
- O assistente trabalha somente em modo leitura e recebe um conjunto reduzido de campos.
- O banco SQLite, backups, fotos e sessões locais ficam fora do Git.

Em produção, use HTTPS, defina uma SESSION_SECRET forte e mantenha o servidor em ambiente protegido. O sistema não substitui políticas institucionais de LGPD, controle de acesso físico, backup externo ou gestão de incidentes.

### Acessibilidade

O SGAC oferece alto contraste, texto ampliado, redução de movimento, navegação por teclado, link para pular ao conteúdo principal, foco em diálogos e alternativas textuais para gráficos. A meta de desenvolvimento é WCAG 2.2 AA, mas isso não representa certificação formal.

Consulte [ACCESSIBILITY.md](ACCESSIBILITY.md) para critérios e referências. Testes manuais com teclado, zoom, reflow, leitor de tela e pessoas usuárias continuam essenciais.

## Testes e colaboração

Antes de abrir um pull request, execute na raiz:

~~~powershell
npm test
npm run lint
npm run build
~~~

Os testes cobrem, entre outros pontos, permissões por papel, conta temporária de aluno, foto de perfil, atualização de matérias, risco acadêmico, controladores do assistente, migração de schema e regras da Vida Acadêmica. O workflow em .github/workflows/ci.yml executa testes, lint e build em pushes e pull requests.

O fluxo de colaboração e as branches estão explicados em [CONTRIBUTING.md](CONTRIBUTING.md). A orientação principal é dividir o trabalho por responsabilidade de código — interface, API, dados e assistente — e integrar mudanças pequenas em develop, em vez de manter branches permanentes de frontend ou banco por longos períodos.

## Limites conhecidos e manutenção

- Não há sincronização automática com SUAP ou outro sistema externo.
- A Vida Acadêmica e o cadastro legado coexistem; lançar aula no diário não reescreve automaticamente materias_json, nota consolidada ou total de aulas do cadastro legado.
- Documentos acadêmicos são metadados com referência externa; upload e armazenamento de arquivo institucional não fazem parte desse módulo.
- O assistente não cria, altera ou remove dados e não deve ser usado como substituto das telas de operação.
- SQLite é apropriado para instalação local e equipes pequenas; uma implantação institucional de maior escala pode exigir plano de backup, observabilidade, concorrência e migração para um banco servidor.

Quando uma funcionalidade for alterada, atualize este README no mesmo pull request. A documentação deve descrever apenas comportamentos implementados, apontar limites reais e manter os diagramas coerentes com as rotas, testes e schema atuais.

## Referências

- [React: Thinking in React](https://react.dev/learn/thinking-in-react)
- [Express: Routing](https://expressjs.com/en/guide/routing.html)
- [SQLite: Foreign Key Support](https://www.sqlite.org/foreignkeys.html)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [WCAG 2.2 Quick Reference — W3C](https://www.w3.org/WAI/WCAG22/quickref/)
