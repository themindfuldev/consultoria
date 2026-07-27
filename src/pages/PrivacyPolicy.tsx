import { LegalPage } from '../components/LegalPage';

const CONTACT_URL = 'https://tiagoromero.me/contact/';

/** Public privacy policy — referenced by the Google OAuth consent screen. */
export function PrivacyPolicy() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="27 de julho de 2026">
      <p>
        Esta Política de Privacidade descreve como o aplicativo <strong>Consultoria</strong> (“o
        app”, “nós”) coleta, usa e protege seus dados quando você utiliza o serviço. Ao usar o app,
        você concorda com as práticas descritas aqui.
      </p>

      <h2>Quem somos</h2>
      <p>
        Consultoria é um aplicativo de acompanhamento de treino personalizado que conecta alunos e
        treinadores. Para dúvidas sobre privacidade, entre em contato pelo nosso{' '}
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
          formulário de contato
        </a>
        .
      </p>

      <h2>Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Dados da sua Conta Google:</strong> nome, endereço de e-mail e foto de perfil,
          fornecidos pelo Google quando você faz login. Usamos esses dados apenas para identificar
          você dentro do app.
        </li>
        <li>
          <strong>Dados de treino:</strong> ciclos, sessões, exercícios, cargas, observações e
          feedbacks que você ou seu treinador registram no app.
        </li>
        <li>
          <strong>Vídeos e mídias:</strong> vídeos de execução de exercícios que você opta por
          enviar. Esses arquivos são armazenados no <strong>seu próprio Google Drive</strong>, não em
          nossos servidores.
        </li>
      </ul>

      <h2>Como usamos os serviços do Google</h2>
      <p>
        Com a sua autorização, o app acessa serviços do Google em seu nome para funcionar. Os
        escopos solicitados e o motivo de cada um:
      </p>
      <ul>
        <li>
          <strong>Google Sheets (<code>spreadsheets</code>):</strong> criar e atualizar a planilha
          que armazena seus dados de treino.
        </li>
        <li>
          <strong>Google Drive (<code>drive.file</code>):</strong> criar e acessar somente as pastas
          e arquivos criados pelo próprio app (por exemplo, os vídeos que você envia). O app{' '}
          <strong>não</strong> tem acesso a outros arquivos do seu Drive.
        </li>
        <li>
          <strong>Google Docs (<code>documents</code>):</strong> criar e editar o documento de
          feedback do treino.
        </li>
      </ul>
      <p>
        O uso e a transferência de informações recebidas das APIs do Google seguem a{' '}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Política de Dados do Usuário dos Serviços de API do Google
        </a>
        , incluindo os requisitos de Uso Limitado.
      </p>

      <h2>Onde seus dados ficam armazenados</h2>
      <ul>
        <li>
          Dados de perfil e de treino são armazenados no <strong>Google Firebase (Firestore)</strong>,
          serviço de nuvem do Google.
        </li>
        <li>
          Planilhas, documentos e vídeos ficam no <strong>seu próprio Google Drive</strong>, sob o
          seu controle.
        </li>
      </ul>

      <h2>Compartilhamento de dados</h2>
      <p>
        Não vendemos nem compartilhamos seus dados com terceiros para fins de publicidade. Seus
        dados de treino podem ser visíveis para o treinador que você escolher vincular à sua conta,
        exclusivamente para fins de acompanhamento. Vídeos enviados podem ser compartilhados por link
        com o seu treinador, conforme você definir.
      </p>

      <h2>Retenção e exclusão</h2>
      <p>
        Mantemos seus dados enquanto sua conta estiver ativa. Você pode solicitar a exclusão dos seus
        dados a qualquer momento pelo nosso{' '}
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
          formulário de contato
        </a>
        . Arquivos armazenados no seu Google Drive podem ser excluídos diretamente por você a qualquer
        momento, e você pode revogar o acesso do app na sua{' '}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
        >
          Conta Google
        </a>
        .
      </p>

      <h2>Segurança</h2>
      <p>
        Utilizamos os mecanismos de autenticação e as regras de segurança do Google Firebase para
        proteger o acesso aos seus dados. Nenhum método de transmissão ou armazenamento é 100%
        seguro, mas adotamos medidas razoáveis para proteger suas informações.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode acessar, corrigir ou excluir seus dados, além de revogar as permissões concedidas
        ao app a qualquer momento. Para exercer esses direitos, entre em contato pelo formulário
        indicado abaixo.
      </p>

      <h2>Alterações nesta política</h2>
      <p>
        Podemos atualizar esta Política de Privacidade periodicamente. A data da última atualização é
        indicada no topo desta página.
      </p>

      <h2>Contato</h2>
      <p>
        Em caso de dúvidas sobre esta política, entre em contato pelo nosso{' '}
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
          formulário de contato
        </a>
        .
      </p>
    </LegalPage>
  );
}
