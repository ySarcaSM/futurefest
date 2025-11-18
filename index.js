//Bibliotecas usadas no código.
const express = require('express')
const ObjectId  = require('mongodb').ObjectId
const MongoClient = require('mongodb').MongoClient
const session = require('express-session')
const bcrypt = require('bcrypt')
const methodOverride = require('method-override')
const path = require("path");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

//Constantes de configuração  que serão usadas no código.
const app = express()
const porta = 3000
const genAI = new GoogleGenerativeAI("AIzaSyCZeRFVrzlebbGWkFbhkJkUjYOlj7NYRLw");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

//Registrando middlewares para serem executados.
app.use(express.static(__dirname + '/public'))
app.use(express.urlencoded({extended:true}))
app.use(express.json())
app.use(session({
    secret: 'segredo-super-seguro',
    resave: false,
    saveUninitialized: true,
}))
app.use(methodOverride('_method'))

//Configurações do mongodb usadas no código.
const urlMongo = "mongodb+srv://admin:admin@cluster0.huwt4el.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
const nomeBanco = 'sistemaBioenergy'
const collectionName = 'usuarios'
const collectionServico = 'servicos'
const collectionManu = 'manutenções'
const collectionFeedback = 'feedbacks'
const collectionProdutos = 'produtos'
const collectionCarrinho = 'carrinho'
const collectionCompras = 'compras';

//Rotas principais do código, para o usuário entrar na página, fazer login e registro e rotas de controle.
app.get('/', (req,res)=>{
    res.sendFile(__dirname + '/views/index.html')
})

app.get('/registro', (req,res)=>{
    res.sendFile(__dirname + '/views/registro.html')
})

app.post('/registro', async (req,res)=>{
    const cliente = new MongoClient(urlMongo)
    try {
        await cliente.connect()
        const banco = cliente.db(nomeBanco)
        const colecaoUsuarios = banco.collection(collectionName)

        const usuarioExistente = await colecaoUsuarios.findOne({usuario: req.body.usuario})
        if(usuarioExistente){
            res.send('Usuário já existe! Tente outro nome de usuário.')
        }else{
            const senhaCriptografada = await bcrypt.hash(req.body.senha, 10)
            await colecaoUsuarios.insertOne({
                usuario: req.body.usuario,
                senha: senhaCriptografada,
                tipo: 'comum'
            })
            res.redirect('/login')
        }
    }catch(erro){
        res.send('Erro ao registrar o usuário.')
    }finally {
        cliente.close()
    }
})

app.get('/login', (req,res)=>{
    res.sendFile(__dirname + '/views/login.html')
})

app.post("/login", async (req, res) => {
  const cliente = new MongoClient(urlMongo);
  
  try {
    await cliente.connect();
    const banco = cliente.db(nomeBanco);
    const colecaoUsuarios = banco.collection(collectionName);

    const usuario = await colecaoUsuarios.findOne({ usuario: req.body.usuario });

    if (usuario && await bcrypt.compare(req.body.senha, usuario.senha)) {
      req.session.usuario = req.body.usuario;
      req.session.tipo = usuario.tipo;

      res.send(`
        <script>
          sessionStorage.setItem("usuarioLogado", JSON.stringify({
            nome: "${req.body.usuario}",
            tipo: "${usuario.tipo}"
          }));

          window.location.href = "${usuario.tipo === 'admin' ? '/admin' : '/user'}";
        </script>
      `);
    } else {
      res.redirect("/erro");
    }
  } catch (erro) {
    console.error("Erro no login:", erro);
    res.send("Erro ao realizar login.");
  } finally {
    cliente.close();
  }
});

//Rota para formulário e outras coisas

app.post('/formulario_feedback', async (req,res)=>{
   const novoFeedback = req.body
   const client = new MongoClient(urlMongo)

   try {
       await client.connect()
       const db = client.db(nomeBanco)
       const collection = db.collection(collectionFeedback)

       const result = await collection.insertOne(novoFeedback)
       console.log(`Feedback cadastrado com sucesso. ID: ${result.insertedId}`)
        
   }catch(err){
    console.error('Erro ao cadastrar o feedback: ', err)
    res.status(500).send('Erro ao cadastrar o feedback. Por favor tente mais tarde ')
   }finally{
    client.close()
    res.redirect('/')
   }
})

app.get('/erro', (req,res)=>{
    res.sendFile(__dirname + '/views/erro.html')
})

app.get('/sair', (req,res)=>{
    req.session.destroy((err)=>{
        if(err){
            return res.send('Erro ao sair!')
        }res.redirect('/login')
    })
})

//Middlewares para proteger rotas após um login de usuário ou administrador.
function protegerRota(req,res,proximo){
    if(req.session.usuario){
        proximo()
    }else{
        res.redirect('/login')
    }
}

function protegerAdmin(req, res, next) {
  if (req.session.usuario && req.session.tipo === 'admin') {
    next();
  } else {
    res.status(403).send('Acesso negado. Área restrita a administradores.');
  }
}

//Rotas para quando usuários e administradores logarem
app.get('/user', protegerRota, (req,res)=>{
    res.sendFile(__dirname + '/views/user/index.html')
})

app.get('/admin', protegerAdmin, (req, res) => {
  res.sendFile(__dirname + '/views/admin/index.html');
});

//Rotas para o usuário poder mudar seu usuário e sua senha

app.get('/mudar-usuario', protegerRota, (req,res)=>{
    res.sendFile(__dirname + '/views/mudarUsuário.html')
})

app.post('/mudar-usuario', protegerRota, async (req, res) => {
  const { novoUsuario } = req.body;
  const usuarioAtual = req.session.usuario;
  const client = new MongoClient(urlMongo);

  try {
    await client.connect();
    const db = client.db(nomeBanco);
    const collection = db.collection(collectionName);

    const result = await collection.updateOne(
      { usuario: usuarioAtual },
      { $set: { usuario: novoUsuario } }
    );

    if (result.modifiedCount > 0) {
      console.log(`Usuário "${usuarioAtual}" atualizado para "${novoUsuario}"`);
      req.session.usuario = novoUsuario;
      res.redirect('/user');
    } else {
      res.status(404).send('Usuário não encontrado ou não modificado.');
    }
  } catch (err) {
    console.error('Erro ao atualizar o usuário:', err);
    res.status(500).send('Erro ao atualizar o usuário. Por favor, tente novamente mais tarde.');
  } finally {
    client.close();
  }
});

app.get('/mudar-senha', protegerRota, (req, res) => {
  res.sendFile(__dirname + '/views/mudarSenha.html')
});

app.post('/mudar-senha', protegerRota, async (req, res) => {
  const { senhaAtual, novaSenha, confirmarSenha } = req.body;
  const usuarioAtual = req.session.usuario;
  const client = new MongoClient(urlMongo);

  try {
    await client.connect();
    const db = client.db(nomeBanco);
    const collection = db.collection(collectionName);

    const usuario = await collection.findOne({ usuario: usuarioAtual });

    if (!usuario) {
      return res.sendFile(__dirname + '/views/user/html/senha/usuarioNaoEncontrado.html')
    }

    const senhaCorreta = await bcrypt.compare(senhaAtual, usuario.senha);
    if (!senhaCorreta) {
      return res.sendFile(__dirname + '/views/user/html/senha/senhaIncorreta.html')
    }

    if (novaSenha !== confirmarSenha) {
      return res.sendFile(__dirname + '/views/user/html/senha/senhaNaoConcide.html')
    }

    const senhaCriptografada = await bcrypt.hash(novaSenha, 10);
    const result = await collection.updateOne(
      { usuario: usuarioAtual },
      { $set: { senha: senhaCriptografada } }
    );

    if (result.modifiedCount > 0) {
      req.session.senha = novaSenha;
      return res.sendFile(__dirname + '/views/user/html/senha/senhaAltera.html')
    } else {
      return res.sendFile(__dirname + '/views/user/html/senha/senhaFalha.html')
    }
  } catch (err) {
    console.error('Erro ao atualizar a senha:', err);
    return res.sendFile(__dirname + '/views/user/html/senha/erroInterno.html')
  } finally {
    client.close();
  }
});

//Rota para fazer o assistente rápido funcionar
app.post('/assistente', (req, res) => {
  const { nome, area, tipo } = req.body;

  if (!nome || !area || !tipo) {
    return res.status(400).json({ erro: 'Preencha nome, área e tipo corretamente.' });
  }

  const areaNum = parseFloat(area);
  if (isNaN(areaNum)) {
    return res.status(400).json({ erro: 'Área deve ser um número válido.' });
  }

  let recomendacao = '';
  const equipamentos = {
    organica: {
      pequeno: 'BioEnergyCube',
      medio: 'BioEnergyEcoDrive',
      grande: 'BioEnergyContainer'
    },
    madeira: {
      pequeno: 'BioEnergyWoodX',
      medio: 'BioEnergyWooderPro'
    }
  };

  let porte = '';
  if (areaNum < 500) porte = 'pequeno';
  else if (areaNum < 2000) porte = 'medio';
  else porte = 'grande';

  const equipamento = equipamentos[tipo][porte];

  recomendacao = `Recomendamos o equipamento <strong>${equipamento}</strong> para sua área de ${areaNum} m² com biomassa do tipo ${tipo === 'organica' ? 'orgânica' : 'madeira'}. Se quiser mais informações, faça Login e use o nosso recurso de chatbot!.`;

  res.json({
    mensagem: `Olá ${nome}! ${recomendacao}`
  });
});

//Rota para pegar o tipo de acesso na navbar
app.get('/session', (req, res) => {
  if (req.session.usuario) {
    res.json({ usuario: req.session.usuario, tipo: req.session.tipo }); 
  } else {
    res.status(401).json({ autenticado: false });
  }
});



//Prompt de contexto para a Ia ser quem ela é.
const systemPrompt = `
Você é um assistente virtual da BioEnergy, uma empresa especializada em energia limpa a partir de biomassa.
Seu papel é ajudar os visitantes a escolher os melhores produtos e serviços da empresa, além de responder dúvidas sobre biomassa, energia renovável e sustentabilidade.

Siga estas diretrizes:

Fale sempre em português.
Seja educado, direto e claro.
Dê respostas curtas e objetivas, evitando textos longos.
Forneça informações sobre:
- Serviços (BioBronze, BioGold e BioPlatinum)
- A empresa e sua missão
- Energia renovável, biomassa e práticas ambientais

Use esse pequeno banco de estatísticas para dar ao cliente boas recomendações:

Estatísticas do BioEnergyCube:
M²: entre 0 e 500
Tipo de biomassa: Cana de açucar, esterco, palha
Capacidade de biomassa: 1.000 litros (≈ 1 m³)
Taxa de processamento: 0,7 L/min
Tempo para processar o tanque cheio: ≈ 1.430 minutos (23 h 50 min)
Energia gerada por litro: ≈ 10 Wh/L
Energia gerada por minuto: 7 Wh/min (0,007 kWh/min)
Energia total por ciclo (1.000 L): 10.000 Wh = 10 kWh
Custo para processar 1 L de biomassa: R$ 0,02 (média entre R$ 0,01 e R$ 0,03)
Custo total por ciclo: R$ 20,00
Custo operacional por kWh: R$ 2,00/kWh
Energia gerada por real gasto: 0,5 kWh/R$ (≈ 500 Wh/R$)
Preço estimado do equipamento: R$ 3.500,00

Estatísticas do BioEnergyEcoDrive:
M²: 501 e 2000
Tipo de biomassa: Cana de açucar, esterco, palha
Capacidade de biomassa: 5.000 litros
Taxa de processamento: 10 L/min
Tempo para processar o tanque cheio: 500 minutos (≈ 8 h 20 min)
Energia gerada por litro: 5,25 Wh/L
Energia gerada por minuto: 52,5 Wh/min (0,0525 kWh/min)
Energia total por ciclo (5.000 L): 26.250 Wh = 26,25 kWh
Custo para processar 1 L de biomassa: R$ 0,05
Custo total por ciclo: R$ 250,00
Custo operacional por kWh: R$ 9,52/kWh
Energia gerada por real gasto: 0,105 kWh/R$ (≈ 105 Wh/R$)
Preço estimado do equipamento: R$ 8.500,00

Estatísticas do BioEnergyContainer:
M²: A partir de 2001 
Tipo de biomassa: Cana de açucar, esterco, palha
Capacidade de biomassa: 8.000 litros
Taxa de processamento: 15 L/min
Tempo para processar tanque cheio: ~533 minutos (≈ 8 h 53 min)
Energia gerada por litro: 5,25 Wh/L
Energia gerada por minuto: 78,75 Wh/min (0,07875 kWh/min)
Energia total por ciclo: 42 kWh
Custo para processar 1 L de biomassa: R$ 0,05
Custo total por ciclo: R$ 400
Custo operacional por kWh: R$ 9,52/kWh
Energia gerada por real gasto: 0,105 kWh/R$ (105 Wh/R$)
Preço estimado do equipamento: R$ 15.000

Estatísticas do BioEnergyWoodX:
M²: 0 a 500
Tipo de biomassa: Madeira, cavacos e aparas
Capacidade de biomassa: 500 litros
Taxa de processamento: 1,5 L/min
Tempo para processar tanque cheio: 500 ÷ 1,5 ≈ 333 minutos (~5 h 33 min)
Energia gerada por litro: 5 ÷ 1,5 ≈ 3,33 Wh/L
Energia gerada por minuto: 5 Wh/min (0,005 kWh/min)
Energia total por ciclo (500 L): 500 × 3,33 ≈ 1.665 Wh ≈ 1,67 kWh
Custo para processar 1 L de biomassa: R$ 0,02
Custo total por ciclo: 500 × 0,02 = R$ 10
Custo operacional por kWh: 10 ÷ 1,67 ≈ R$ 5,99/kWh
Energia gerada por real gasto: 1,67 ÷ 10 ≈ 0,167 kWh/R$ (167 Wh/R$)
Preço estimado do equipamento: R$ 2.500

Estatísticas do BioEnergyWooderPro:
M²: A partir de 500
Tipo de biomassa: Madeira, cavacos e aparas
Capacidade de biomassa: 2.000 litros
Taxa de processamento: 7 L/min
Tempo para processar tanque cheio: 2.000 ÷ 7 ≈ 286 minutos (~4 h 46 min)
Energia gerada por litro: 16 ÷ 7 ≈ 2,29 Wh/L
Energia gerada por minuto: 16 Wh/min (0,016 kWh/min)
Energia total por ciclo (2.000 L): 2.000 × 2,29 ≈ 4.580 Wh ≈ 4,58 kWh
Custo para processar 1 L de biomassa: R$ 0,075
Custo total por ciclo: 2.000 × 0,075 = R$ 150
Custo operacional por kWh: 150 ÷ 4,58 ≈ R$ 32,75/kWh
Energia gerada por real gasto: 4,58 ÷ 150 ≈ 0,0305 kWh/R$ (30,5 Wh/R$)
Preço estimado do equipamento: R$ 6.000

Lembre-se que o tipo de biomassa não se restringe apenas aos citados, mas ao grupo que eles fazem parte. Ao recomendar máquina. Diga sempre assim: o nome, estatísticas de energia gerada por litro e minuto, custo para processar e capacidade. As outras informações você pode dizer caso o usuário pedir. A área em m² não manda na recomendação dos produtos, apenas o tipo de biomassa, por exemplo se o usuário tiver uma área pequena porém usar muita cana é preferível recomendar o EcoDrive ao invés do Cube. 

Use esse banco de dados de planos para recomendar o melhor plano para um tipo de usuário

Regras de recomendação de planos
- BioBronze: básico, custo R$ 14.000 (mensal ≈ R$ 1.166, anual ≈ R$ 12.600). Indicado para iniciantes.
- BioGold: completo, custo R$ 28.000 (mensal ≈ R$ 2.333, anual ≈ R$ 25.200). Indicado para empresas que querem soluções completas.
- BioPlatinum: premium, custo R$ 34.000 (mensal ≈ R$ 2.833, anual ≈ R$ 30.600). Indicado para quem busca certificações e suporte total.

Responda de forma clara, objetiva e bem organizada. Use frases completas e evite blocos de texto confusos. Para informações técnicas (como estatísticas de equipamentos), apresente os dados em parágrafos curtos, com medidas e valores destacados de forma natural no texto, sem excesso de negrito ou marcadores. Sempre inclua um resumo ou conclusão prática ao final. Se houver números importantes (como capacidade, energia, custo), inclua-os no corpo do texto de forma legível e fluida. Exemplo de estilo desejado:

'O BioEnergyWooderPro é ideal para biomassa de madeira e possui capacidade para 2.000 litros. Ele gera 16 Wh de energia por minuto, o que equivale a 2,29 Wh por litro processado. O custo para processar cada litro de biomassa é de R$ 0,075. Esse equipamento fornece energia suficiente para atender necessidades médias em terrenos de 500 m², aproveitando resíduos de madeira de forma eficiente.'

Para links de navegação dentro do site, use HTML, no formato <a href="rota">Texto do link</a>. 
Por exemplo:
   - Para o usuário acessar produtos: <a href="/produtos">produtos</a>
   - Para serviços: <a href="/servicos">serviços</a>
   - Para manutenções: <a href="/manutencoes">manutenções</a>
   - Para contanto : <a href="/#form-feedback">contato</a>
Sempre utilize o histórico da conversa para responder de forma contextualizada, lembrando das mensagens anteriores do usuário. Diga as respostas com base no histórico e é isso.

Seu objetivo é oferecer um atendimento simples, rápido e informativo, ajudando o cliente a entender as soluções da BioEnergy e tomar boas decisões.
`;

//Rota para fazer com que os dados do usuário sejam carregados ao fazer login
app.get('/dados-usuario', (req, res) => {
  res.json({ usuario: req.session.usuario });
});

//Rota para fazer o chatbot que recomenda máquinas, serviços e manutenções funcionar

app.post("/chatbot", protegerRota, async (req, res) => {

  const cliente = new MongoClient(urlMongo)

  const { usuario, text } = req.body;

  if (!usuario || !text) {
    return res.status(400).json({ reply: "Usuário e mensagem são obrigatórios." });
  }

  try {
    await cliente.connect()
    const db = cliente.db(nomeBanco)
    const historicoCollection = db.collection(collectionHistorico)
    // Buscar histórico do usuário
    let historico = await historicoCollection.findOne({ usuario });

    if (!historico) {
      historico = { usuario, mensagens: [] };
      await historicoCollection.insertOne(historico);
    }

    // Adicionar mensagem do usuário
    historico.mensagens.push({ role: "user", content: text });

    const conversa = historico.mensagens
      .map((msg) => `${msg.role === "user" ? "Usuário" : "Assistente"}: ${msg.content}`)
      .join("\n");

    const prompt = `${systemPrompt}\n\n${conversa}\nAssistente:`;
    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();

    // Adicionar resposta do assistente
    historico.mensagens.push({ role: "assistant", content: reply });

    // Atualizar no MongoDB
    await historicoCollection.updateOne(
      { usuario },
      { $set: { mensagens: historico.mensagens } }
    );

    res.json({ reply });
  } catch (err) {
    console.error("Erro:", err);
    res.status(500).json({ reply: "Erro ao processar a mensagem." });
  }
});

//Rotas para o usuário poder acessar partes da página dos usuários. 

app.get('/produtos', protegerRota, (req,res)=>{
  res.sendFile(__dirname + '/views/user/produtos.html')
})

app.get('/servicos', protegerRota, (req,res)=>{
  res.sendFile(__dirname + '/views/user/servicos.html')
})

app.get('/manutencoes', protegerRota, async (req, res) => {
  const usuario = req.session.usuario;
  const client = new MongoClient(urlMongo);

  try {
    await client.connect();
    const db = client.db(nomeBanco);
    const comprasCollection = db.collection(collectionCompras);

    const compra = await comprasCollection.findOne({ usuario });

    if (!compra) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>Acesso Restrito - BioEnergy</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
          <style>
            .logo { width: 200px; border-radius: 15px; }
            .card-aviso { max-width: 600px; margin: auto; margin-top: 80px; }
          </style>
        </head>
        <body class="bg-light">
<nav class="navbar navbar-expand-lg navbar-dark bg-success">
  <div class="container-fluid px-4">
    <a class="navbar-brand d-flex align-items-center" href="/">
      <img src="/img/logo.svg" alt="Logo BioEnergy" class="logo me-2">
    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse justify-content-end" id="navMenu">
      <ul class="navbar-nav align-items-center">
        <li class="nav-item"><a class="nav-link" href="/">HOME</a></li>
        <li class="nav-item"><a class="nav-link" href="/user">USER</a></li>
        <li class="nav-item"><a class="nav-link" href="/user/#chatbot">CHATBOT</a></li>
        <li class="nav-item"><a class="nav-link" href="/produtos">PRODUTOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/servicos">SERVIÇOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/manutencoes">MANUTENÇÕES</a></li>
  
        <li class="nav-item">
          <a class="nav-link" href="/carrinho">
            <i class="bi bi-cart-fill fs-4"></i> 
          </a>
        </li>

        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="bi bi-person-circle fs-4 me-1"></i>
          </a>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
            <li><h6 class="dropdown-header">Informações Pessoais</h6></li>
            <li><a class="dropdown-item" href="#">Usuário: <span id="nome-usuario">Carregando...</span></a></li>
            <li><a class="dropdown-item" href="#">Senha: ********</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="/mudar-usuario">Mudar Usuário</a></li>
            <li><a class="dropdown-item" href="/mudar-senha">Mudar Senha</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" onclick="realizarLogout(event)">Sair</a></li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</nav>

          <section class="py-5">
            <div class="container">
              <div class="card-aviso bg-white p-4 rounded shadow-sm text-center">
                <h2 class="text-warning mb-3">
                  <i class="bi bi-exclamation-triangle-fill me-2"></i>
                  Acesso Restrito
                </h2>
                <p class="fs-5">
                  Você precisa possuir um produto comprado para acessar as manutenções.
                </p>
                <a href="/produtos" class="btn btn-success mt-3 w-100">
                  Ver Produtos Disponíveis
                </a>
              </div>
            </div>
          </section>
        <script>
          fetch('/dados-usuario')
    .then(res => res.json())
    .then(data => {
      document.getElementById('nome-usuario').textContent = data.usuario;
    });
        function realizarLogout(event) {
   
        event.preventDefault(); 
    
        sessionStorage.removeItem('usuarioLogado');
    
        window.location.href = '/sair'; 
}
        </script>
          <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
        </body>
        </html>
      `);
    }

    res.sendFile(__dirname + '/views/user/manutencoes.html');

  } catch (err) {
    console.error('Erro ao verificar acesso a manutenções:', err);
    res.status(500).send('Erro interno do servidor');
  } finally {
    await client.close();
  }
});

app.get('/tem-produto', protegerRota, async (req, res) => {
  const usuario = req.session.usuario;
  const client = new MongoClient(urlMongo);

  try {
    await client.connect();
    const db = client.db(nomeBanco);
    const comprasCollection = db.collection(collectionCompras);

    const compra = await comprasCollection.findOne({ usuario });
    res.json({ temProduto: !!compra }); 
  } catch (err) {
    console.error(err);
    res.json({ temProduto: false });
  } finally {
    await client.close();
  }
});

app.get('/produtos-usuario', protegerRota, async (req, res) => {
  const usuario = req.session.usuario;
  const client = new MongoClient(urlMongo);

  try {
    await client.connect();
    const db = client.db(nomeBanco);
    const comprasCollection = db.collection(collectionCompras);

    const compras = await comprasCollection.find({ usuario }).toArray();

    const produtos = compras
      .flatMap(c => c.produtos || []) 
      .map(p => ({
        nome: p.nome || 'Produto sem nome',
        id: p.produtoId || ''
      }))
      .filter(p => p.id);
    res.json({ produtos });
  } catch (err) {
    console.error(err);
    res.json({ produtos: [] });
  } finally {
    client.close();
  }
});

// Registrar manutenção
app.post('/adicionar-manutencao', async (req, res) => {

  const client = new MongoClient(urlMongo);

  try {
    const { usuario, produto, tipo, custoHora, custoTotal, dias } = req.body;

    if (!usuario || !produto || !tipo) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    await client.connect();
    const db = client.db(nomeBanco);
    const manutencoesCollection = db.collection(collectionManu);

    const manutencao = {
      usuario,
      produto,
      tipo,
      custoHora,
      custoTotal,
      dias,
      disponivel: "Sim",
      data: new Date()
    };

    const result = await manutencoesCollection.insertOne(manutencao);

    res.json({ sucesso: true, id: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar manutenção' });
  } finally {
    await client.close();
  }
});

//Rota para adicionar serviços do usuário no mongodb

app.post('/adicionar-servico', async (req, res) => {
  const client = new MongoClient(urlMongo);

  try {
    const { usuario, plano, tipoPagamento, custo, duracao } = req.body;

    if (!usuario || !plano || !tipoPagamento || !custo || !duracao) {
      return res.status(400).json({ erro: 'Dados incompletos' });
    }

    await client.connect();
    const db = client.db(nomeBanco);
    const servicosCollection = db.collection(collectionServico); 

    const servico = {
      usuario,
      plano,            
      tipoPagamento,    
      custo,            
      duracao,          
      disponivel: "Sim",
      data: new Date()
    };

    const result = await servicosCollection.insertOne(servico);

    res.json({ sucesso: true, id: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar serviço' });
  } finally {
    await client.close();
  }
});



//Sistema de carrinho para o usuário.

app.get('/produto/:nome', protegerRota, async (req, res) => {
    const { nome } = req.params;
    const client = new MongoClient(urlMongo);

    try {
        await client.connect();
        const db = client.db(nomeBanco);
        const collection = db.collection(collectionProdutos); 

        const produto = await collection.findOne({ nome });
        if (!produto) return res.status(404).send('Produto não encontrado');

        res.send(`
            <h1>${produto.nome}</h1>
            <p>Preço: R$ ${produto.preco}</p>
            <form action="/adicionar-carrinho" method="POST">
                <input type="hidden" name="produtoId" value="${produto._id}">
                <input type="hidden" name="nome" value="${produto.nome}">
                <input type="hidden" name="preco" value="${produto.preco}">
                <label>Quantidade: <input type="number" name="quantidade" value="1" min="1"></label>
                <button type="submit">Adicionar ao carrinho</button>
            </form>
        `);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao abrir página do produto');
    } finally {
        client.close();
    }
});

app.post('/adicionar-carrinho', protegerRota, async (req, res) => {
    const { produtoId, quantidade } = req.body;
    const usuario = req.session.usuario;
    const qtdDesejada = parseInt(quantidade);
    const client = new MongoClient(urlMongo);

    try {
        await client.connect();
        const db = client.db(nomeBanco);
        const produtosCollection = db.collection(collectionProdutos);
        const carrinhoCollection = db.collection(collectionCarrinho);

       
        const produto = await produtosCollection.findOne({ nome: req.body.nome });
        if (!produto) return res.status(404).send('Produto não encontrado.');

        const estoque = Number(produto.estoque) || 0;
        const disponivel = produto.disponivel; 
        if (disponivel === 'Não') return res.sendFile(__dirname + '/views/user/html/produto/produtoIndisponível.html');

        let carrinhoUsuario = await carrinhoCollection.findOne({ usuario });
        let qtdNoCarrinho = 0;

        if (carrinhoUsuario) {
            const itemNoCarrinho = carrinhoUsuario.produtos.find(p => p.produtoId === produtoId);
            if (itemNoCarrinho) qtdNoCarrinho = itemNoCarrinho.quantidade;
        }

        if (qtdDesejada + qtdNoCarrinho > estoque) {
            return res.send(`
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <title>Erro - BioEnergy</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons/font/bootstrap-icons.css" rel="stylesheet">
                    <style>
                        .logo { width: 200px; border-radius: 15px; }
                        .error-card { max-width: 500px; margin: auto; }
                        .form-card { max-width: 500px; margin: 80px auto;background-color: #fff; padding: 30px; border-radius: 10px;box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                        .logo {width: 180px;border-radius: 12px;}
                        .section-title {color: #198754;font-weight: 700;margin-bottom: 30px;text-align: center;}
                    </style>
                </head>
                <body class="bg-light">
                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<nav class="navbar navbar-expand-lg navbar-dark bg-success">
  <div class="container-fluid px-4">
    <a class="navbar-brand d-flex align-items-center" href="/">
      <img src="/img/logo.svg" alt="Logo BioEnergy" class="logo me-2">
    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse justify-content-end" id="navMenu">
      <ul class="navbar-nav align-items-center">
        <li class="nav-item"><a class="nav-link" href="/">HOME</a></li>
        <li class="nav-item"><a class="nav-link" href="/user">USER</a></li>
        <li class="nav-item"><a class="nav-link" href="/user/#chatbot">CHATBOT</a></li>
        <li class="nav-item"><a class="nav-link" href="/produtos">PRODUTOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/servicos">SERVIÇOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/manutencoes">MANUTENÇÕES</a></li>
 
        <li class="nav-item">
          <a class="nav-link" href="/carrinho">
            <i class="bi bi-cart-fill fs-4"></i> 
          </a>
        </li>

        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="bi bi-person-circle fs-4 me-1"></i>
          </a>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
            <li><h6 class="dropdown-header">Informações Pessoais</h6></li>
            <li><a class="dropdown-item" href="#">Usuário: <span id="nome-usuario">Carregando...</span></a></li>
            <li><a class="dropdown-item" href="#">Senha: ********</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="/mudar-usuario">Mudar Usuário</a></li>
            <li><a class="dropdown-item" href="/mudar-senha">Mudar Senha</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" onclick="realizarLogout(event)">Sair</a></li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</nav>
                <section class="py-5">
                    <div class="container">
                        <div class="error-card bg-white p-4 rounded shadow-sm text-center">
                            <h2 class="text-danger mb-3"><i class="bi bi-exclamation-triangle-fill me-2"></i>Erro ao Adicionar Produto</h2>
                            <p class="mb-4">${`Não é possível adicionar ${qtdDesejada} unidades. Apenas ${estoque - qtdNoCarrinho} disponíveis.`}</p>
                            <a href="/produtos" class="btn btn-outline-danger w-100">Voltar para Produtos</a>
                        </div>
                    </div>
                </section>
              
<script>
    fetch('/dados-usuario')
        .then(res => res.json())
        .then(data => {
            document.getElementById('nome-usuario').textContent = data.usuario;
        });
    function realizarLogout(event) {
   
        event.preventDefault(); 
    
        sessionStorage.removeItem('usuarioLogado');
        sessionStorage.removeItem('logado'); 
    
        window.location.href = '/sair'; 
    } 
</script>

                </body>
                </html>
            `);
        }

        const produtoObj = {
            produtoId: produto._id.toString(),
            nome: produto.nome,
            preco: Number(produto.preco),
            quantidade: qtdDesejada
        };

        if (carrinhoUsuario) {
            const index = carrinhoUsuario.produtos.findIndex(p => p.produtoId === produtoId);
            if (index >= 0) {
                carrinhoUsuario.produtos[index].quantidade += qtdDesejada;
            } else {
                carrinhoUsuario.produtos.push(produtoObj);
            }
            await carrinhoCollection.updateOne(
                { usuario },
                { $set: { produtos: carrinhoUsuario.produtos } }
            );
        } else {
            await carrinhoCollection.insertOne({ usuario, produtos: [produtoObj] });
        }

        res.redirect('/carrinho');
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao adicionar produto ao carrinho');
    } finally {
        client.close();
    }
});

app.get('/carrinho', protegerRota, async (req, res) => {
    const usuario = req.session.usuario;
    const client = new MongoClient(urlMongo);

    try {
        await client.connect();
        const db = client.db(nomeBanco);
        const carrinhoCollection = db.collection(collectionCarrinho);

        const carrinhoUsuario = await carrinhoCollection.findOne({ usuario });
        
        const produtos = (carrinhoUsuario?.produtos || []).flat().filter(p => p && p.nome && p.preco && p.quantidade);
        
        const total = produtos.reduce((acc, p) => acc + p.preco * p.quantidade, 0);

        let html = `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Meu Carrinho</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons/font/bootstrap-icons.css" rel="stylesheet">
            <style>
                .card { border: none; border-radius: 15px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 15px; }
                .card:hover { transform: scale(1.02); box-shadow: 0 0 15px rgba(25, 135, 84, 0.3); }
                .card-img-top { height: 220px; object-fit: cover; border-top-left-radius: 15px; border-top-right-radius: 15px; }
                .page-title { text-align: center; color: #198754; font-weight: 800; margin: 50px 0 20px; }
                .logo { width: 180px; border-radius: 12px; }
            </style>
        </head>
        <body class="bg-light">
<nav class="navbar navbar-expand-lg navbar-dark bg-success">
  <div class="container-fluid px-4">
    <a class="navbar-brand d-flex align-items-center" href="/">
      <img src="/img/logo.svg" alt="Logo BioEnergy" class="logo me-2">
    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse justify-content-end" id="navMenu">
      <ul class="navbar-nav align-items-center">
        <li class="nav-item"><a class="nav-link" href="/">HOME</a></li>
        <li class="nav-item"><a class="nav-link" href="/user">USER</a></li>
        <li class="nav-item"><a class="nav-link" href="/user/#chatbot">CHATBOT</a></li>
        <li class="nav-item"><a class="nav-link" href="/produtos">PRODUTOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/servicos">SERVIÇOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/manutencoes">MANUTENÇÕES</a></li>
       
        <li class="nav-item">
          <a class="nav-link" href="/carrinho">
            <i class="bi bi-cart-fill fs-4"></i> 
          </a>
        </li>

        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="bi bi-person-circle fs-4 me-1"></i>
          </a>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
            <li><h6 class="dropdown-header">Informações Pessoais</h6></li>
            <li><a class="dropdown-item" href="#">Usuário: <span id="nome-usuario">Carregando...</span></a></li>
            <li><a class="dropdown-item" href="#">Senha: ********</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="/mudar-usuario">Mudar Usuário</a></li>
            <li><a class="dropdown-item" href="/mudar-senha">Mudar Senha</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" onclick="realizarLogout(event)">Sair</a></li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</nav>
        <div class="container py-5">
            <h1 class="page-title">Meu Carrinho</h1>`;

        if (produtos.length === 0) {
            html += `<h3>Seu carrinho está vazio.</h3>
                     <a href="/produtos" class="btn btn-success mt-3">Voltar aos Produtos</a>`;
        } else {
            html += `<ul class="list-group mb-3">`;
            produtos.forEach(p => {
                const subtotal = p.preco * p.quantidade;
                html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                            ${p.nome} - R$ ${p.preco.toFixed(2)} x ${p.quantidade}
                            <span>Subtotal: R$ ${subtotal.toFixed(2)}</span>
                        </li>`;
            });
            html += `</ul>
                     <h3>Total: R$ ${total.toFixed(2)}</h3>
                     <form action="/resumo-compra" method="GET">
                         <button type="submit" class="btn btn-success mt-3 w-100">Prosseguir para Resumo</button>
                     </form>
                     <a href="/produtos" class="btn btn-secondary mt-2 w-100">Continuar Comprando</a>`;
        }

        html += `</div>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
        <script>
    fetch('/dados-usuario')
        .then(res => res.json())
        .then(data => {
            document.getElementById('nome-usuario').textContent = data.usuario;
        });
    function realizarLogout(event) {
   
        event.preventDefault(); 
    
        sessionStorage.removeItem('usuarioLogado');
        sessionStorage.removeItem('logado'); 
    
        window.location.href = '/sair'; 
    } 
</script>
        </body>
        </html>`;

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao carregar o carrinho');
    } finally {
        client.close();
    }
});

app.get('/resumo-compra', protegerRota, async (req, res) => {
    const usuario = req.session.usuario;
    const client = new MongoClient(urlMongo);

    try {
        await client.connect();
        const db = client.db(nomeBanco);
        const carrinhoCollection = db.collection(collectionCarrinho);

        const carrinhoUsuario = await carrinhoCollection.findOne({ usuario });

        const produtos = (carrinhoUsuario?.produtos || []).flat().filter(p => p && p.nome && p.preco && p.quantidade);
        const total = produtos.reduce((acc, p) => acc + p.preco * p.quantidade, 0);

        let html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Resumo da Compra</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons/font/bootstrap-icons.css" rel="stylesheet">
            <style>
                .form-card { max-width: 700px; margin: 80px auto; background-color: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);}
                .card { border: none; border-radius: 15px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 15px; }
                .card:hover { transform: scale(1.02); box-shadow: 0 0 15px rgba(25, 135, 84, 0.3); }
                .card-img-top { height: 220px; object-fit: cover; border-top-left-radius: 15px; border-top-right-radius: 15px; }
                .page-title { text-align: center; color: #198754; font-weight: 800; margin: 50px 0 20px; }
                .logo { width: 180px; border-radius: 12px; }
            </style>
        </head>
        <body class="bg-light">
<nav class="navbar navbar-expand-lg navbar-dark bg-success">
  <div class="container-fluid px-4">
    <a class="navbar-brand d-flex align-items-center" href="/">
      <img src="/img/logo.svg" alt="Logo BioEnergy" class="logo me-2">
    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse justify-content-end" id="navMenu">
      <ul class="navbar-nav align-items-center">
        <li class="nav-item"><a class="nav-link" href="/">HOME</a></li>
        <li class="nav-item"><a class="nav-link" href="/user">USER</a></li>
        <li class="nav-item"><a class="nav-link" href="/user/#chatbot">CHATBOT</a></li>
        <li class="nav-item"><a class="nav-link" href="/produtos">PRODUTOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/servicos">SERVIÇOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/manutencoes">MANUTENÇÕES</a></li>
 
        <li class="nav-item">
          <a class="nav-link" href="/carrinho">
            <i class="bi bi-cart-fill fs-4"></i> 
          </a>
        </li>

        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="bi bi-person-circle fs-4 me-1"></i>
          </a>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
            <li><h6 class="dropdown-header">Informações Pessoais</h6></li>
            <li><a class="dropdown-item" href="#">Usuário: <span id="nome-usuario">Carregando...</span></a></li>
            <li><a class="dropdown-item" href="#">Senha: ********</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="/mudar-usuario">Mudar Usuário</a></li>
            <li><a class="dropdown-item" href="/mudar-senha">Mudar Senha</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" onclick="realizarLogout(event)">Sair</a></li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</nav>
        <div class="container py-5">
            <h1 class="page-title">Resumo da Compra</h1>`;

        if (produtos.length === 0) {
            html += `<h3>Seu carrinho está vazio.</h3>
                     <a href="/produtos" class="btn btn-success mt-3">Voltar aos Produtos</a>`;
        } else {
            html += `<ul class="list-group mb-4">`;
            produtos.forEach(p => {
                const subtotal = p.preco * p.quantidade;
                html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                            ${p.nome} 
                            <span>R$ ${p.preco.toFixed(2)} x ${p.quantidade}</span>
                            <span>Subtotal: R$ ${subtotal.toFixed(2)}</span>
                         </li>`;
            });
            html += `</ul>
                     <div class="d-flex justify-content-between mb-4">
                        <h3>Total: R$ ${total.toFixed(2)}</h3>
                     </div>
                     <div class="d-flex gap-2">
                        <form action="/finalizar-compra" method="POST" class="flex-fill">
                            <button type="submit" class="btn btn-success w-100">Finalizar Compra</button>
                        </form>
                        <form action="/carrinho" method="GET" class="flex-fill">
                            <button type="submit" class="btn btn-secondary w-100">Voltar ao Carrinho</button>
                        </form>
                     </div>`;
        }

        html += `</div>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
             <script>
    fetch('/dados-usuario')
        .then(res => res.json())
        .then(data => {
            document.getElementById('nome-usuario').textContent = data.usuario;
        });
    function realizarLogout(event) {
   
        event.preventDefault(); 
    
        sessionStorage.removeItem('usuarioLogado');
        sessionStorage.removeItem('logado'); 
    
        window.location.href = '/sair'; 
    } 
</script>
        </body>
        </html>`;

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao carregar resumo da compra');
    } finally {
        client.close();
    }
});

app.post('/finalizar-compra', protegerRota, async (req, res) => {
    const usuario = req.session.usuario;
    const client = new MongoClient(urlMongo);

    try {
        await client.connect();
        const db = client.db(nomeBanco);
        const carrinhoCollection = db.collection(collectionCarrinho);
        const comprasCollection = db.collection(collectionCompras);
        const produtosCollection = db.collection(collectionProdutos);

        const carrinhoUsuario = await carrinhoCollection.findOne({ usuario });

        const produtos = (carrinhoUsuario?.produtos || []).flat().filter(p => p && p.nome && p.preco && p.quantidade);

        if (produtos.length === 0) return res.redirect('/carrinho');

        await comprasCollection.insertOne({ usuario, produtos, data: new Date() });

        for (const item of produtos) {
            const quantidadeComprada = Number(item.quantidade) || 0;

            await produtosCollection.updateOne(
                { nome: item.nome },
                [{ $set: { estoque: { $max: [{ $subtract: [{ $toInt: "$estoque" }, quantidadeComprada] }, 0] } } }]
            );
        }

        await carrinhoCollection.updateOne({ usuario }, { $set: { produtos: [] } });

        let html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Compra Concluída</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons/font/bootstrap-icons.css" rel="stylesheet">
            <style>
                .form-card { max-width: 600px; margin: 80px auto; background-color: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                .logo { width: 180px; border-radius: 12px; }
                .page-title { text-align: center; color: #198754; font-weight: 800; margin: 50px 0 20px; }
                .btn-custom { width: 100%; }
            </style>
        </head>
        <body class="bg-light">
<nav class="navbar navbar-expand-lg navbar-dark bg-success">
  <div class="container-fluid px-4">
    <a class="navbar-brand d-flex align-items-center" href="/">
      <img src="/img/logo.svg" alt="Logo BioEnergy" class="logo me-2">
    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse justify-content-end" id="navMenu">
      <ul class="navbar-nav align-items-center">
        <li class="nav-item"><a class="nav-link" href="/">HOME</a></li>
        <li class="nav-item"><a class="nav-link" href="/user">USER</a></li>
        <li class="nav-item"><a class="nav-link" href="/user/#chatbot">CHATBOT</a></li>
        <li class="nav-item"><a class="nav-link" href="/produtos">PRODUTOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/servicos">SERVIÇOS</a></li>
        <li class="nav-item"><a class="nav-link" href="/manutencoes">MANUTENÇÕES</a></li>

        <li class="nav-item">
          <a class="nav-link" href="/carrinho">
            <i class="bi bi-cart-fill fs-4"></i> 
          </a>
        </li>

        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="bi bi-person-circle fs-4 me-1"></i>
          </a>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
            <li><h6 class="dropdown-header">Informações Pessoais</h6></li>
            <li><a class="dropdown-item" href="#">Usuário: <span id="nome-usuario">Carregando...</span></a></li>
            <li><a class="dropdown-item" href="#">Senha: ********</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="/mudar-usuario">Mudar Usuário</a></li>
            <li><a class="dropdown-item" href="/mudar-senha">Mudar Senha</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" onclick="realizarLogout(event)">Sair</a></li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</nav>
        <div class="container py-5 text-center">
            <h1 class="page-title">Compra Finalizada com Sucesso!</h1>
            <p>Obrigado por comprar na BioEnergy. Seus produtos serão processados em breve.</p>
            <a href="/produtos" class="btn btn-success btn-custom mt-3">Voltar aos Produtos</a>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
                     <script>
    fetch('/dados-usuario')
        .then(res => res.json())
        .then(data => {
            document.getElementById('nome-usuario').textContent = data.usuario;
        });
    function realizarLogout(event) {
   
        event.preventDefault(); 
    
        sessionStorage.removeItem('usuarioLogado');
        sessionStorage.removeItem('logado'); 
    
        window.location.href = '/sair'; 
    } 
</script>
        </body>
        </html>
        `;

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao finalizar compra');
    } finally {
        client.close();
    }
});


//Crud de usuários dos administradores

app.get('/admin/usuarios', protegerAdmin, (req,res) =>{
    res.sendFile(__dirname + '/views/admin/html/usuarios.html')
})

app.get('/admin/usuarios_cadastro', protegerAdmin, (req,res)=>{
    res.sendFile(__dirname + '/views/admin/html/usuarios/cadastrar.html')
})

app.post('/admin/usuarios_cadastro', protegerAdmin, async (req,res)=>{
   const novoUsuario = req.body
   const client = new MongoClient(urlMongo)

   try {
       await client.connect()
       const db = client.db(nomeBanco)
       const collection = db.collection(collectionName)

       const senhaCriptografada = await bcrypt.hash(novoUsuario.senha, 10)
       const result = await collection.insertOne({
          usuario: novoUsuario.usuario,
          senha: senhaCriptografada,
          tipo: novoUsuario.tipo || 'comum'
       })
       console.log(`Usuário cadastrado com sucesso. ID: ${result.insertedId}`)
       res.redirect('/admin')
        
   }catch(err){
    console.error('Erro ao cadastrar o usuário: ', err)
    res.status(500).send('Erro ao cadastrar o usuário. Por favor tente mais tarde ')
   }finally{
    client.close()
   }
})

app.get('/admin/usuarios_atualizar', protegerAdmin, async(req,res)=>{
    res.sendFile(__dirname + '/views/admin/html/usuarios/atualizar.html')
})

app.post('/admin/usuarios_atualizar', protegerAdmin, async(req,res)=>{
    const { id, usuario, senha, tipo } = req.body
    const client = new MongoClient(urlMongo)

    try {
        await client.connect()
        const db = client.db(nomeBanco)
        const collection = db.collection(collectionName)
        const senhaCriptografada = await bcrypt.hash(senha, 10)
        const result = await collection.updateOne({ _id: new ObjectId(id)},{
            $set: {usuario, senha: senhaCriptografada, tipo}
        })
        if(result.modifiedCount > 0){
            console.log(`Usuário com o ID: ${id} atualizado com sucesso`)
            res.redirect('/admin')
        }else{
            res.status(404).send('Usuário não encontrado')
        }
    }catch(err){
        console.error('Erro ao atualizar o usuário: ', err)
        res.status(500).send('Erro ao atualizar o usuário. Por favor tente novamente mais tarde.')
    }finally{
        client.close()
    }
})

app.get('/admin/usuario/:id', protegerAdmin, async (req,res)=>{
    const { id } = req.params
    const cliente = new MongoClient(urlMongo)

    try{
        await cliente.connect()
        const db = cliente.db(nomeBanco)
        const collection = db.collection(collectionName)

        const usuario = await collection.findOne({_id: new ObjectId(id)})

        if(!usuario){
            return res.status(404).send('Usuário não encontrado')
        }
        res.json(usuario)
    }catch(err){
        console.error('Erro ao buscar o usuário: ', err)
        res.status(500).send('Erro ao buscar o usuário. Por favor tente novamente mais tarde')
    }finally{
        cliente.close()
    }
})

app.post('/admin/usuarios_deletar', protegerAdmin, async(req,res)=>{
    const {id} = req.body
    const client = new MongoClient(urlMongo)

    try{
        await client.connect()
        const db = client.db(nomeBanco)
        const collection = db.collection(collectionName)

        const result = await collection.deleteOne({_id: new ObjectId(id)})

        if(result.deletedCount > 0){
            console.log(`Usuário com ID: ${id} deletado com sucesso`)
            res.redirect('/admin')
        }else{
            res.status(404).send('Usuário não encontrado')
        }
    }catch(err){
        console.log('Erro ao deletar o usuário:', err)
        res.status(500).send('Erro ao deletar o usuário. Por favor tente novamente mais tarde')
    }finally{
        client.close()
    }
})

app.get('/admin/listar_usuarios', protegerAdmin, async(req,res)=>{
    const cliente = new MongoClient(urlMongo)

    try{
        await cliente.connect()
        const db = cliente.db(nomeBanco)
        const collection = db.collection(collectionName)

        const usuarios = await collection.find({}, {projection: {_id:1, usuario:1, senha:1, tipo:1 }}).toArray()
        res.json(usuarios)
    }catch(err){
        console.error('Erro ao buscar usuários: ', err)
        res.status(500).send('Erro ao buscar usuários. Por favor tente novamente mais tarde.')
    }finally{
        cliente.close()
    }
})

//Crud de produtos dos administradores

app.get('/admin/produtos', protegerAdmin, (req,res) =>{
    res.sendFile(__dirname + '/views/admin/html/produtos.html')
})

app.get('/admin/produtos_cadastro', protegerAdmin, (req,res)=>{
    res.sendFile(__dirname + '/views/admin/html/produtos/cadastrar.html')
})

app.post('/admin/produtos_cadastro', protegerAdmin, async (req,res)=>{
   const novoProduto = req.body
   const client = new MongoClient(urlMongo)

   try {
       await client.connect()
       const db = client.db(nomeBanco)
       const collection = db.collection(collectionProdutos)

       const result = await collection.insertOne(novoProduto)
       console.log(`Produto cadastrado com sucesso. ID: ${result.insertedId}`)
       res.redirect('/admin')
        
   }catch(err){
    console.error('Erro ao cadastrar o produto: ', err)
    res.status(500).send('Erro ao cadastrar o produto. Por favor tente mais tarde ')
   }finally{
    client.close()
   }
})

app.get('/admin/produtos_atualizar', protegerAdmin, async(req,res)=>{
    res.sendFile(__dirname + '/views/admin/html/produtos/atualizar.html')
})

app.post('/admin/produtos_atualizar', protegerAdmin, async(req,res)=>{
    const { id, nome, tipo, capacidade, taxa, tempo, energiaTotal, custoCiclo, eficiencia, preco, estoque, disponivel} = req.body
    const client = new MongoClient(urlMongo)

    try {
        await client.connect()
        const db = client.db(nomeBanco)
        const collection = db.collection(collectionProdutos)
        const result = await collection.updateOne({ _id: new ObjectId(id)},{
            $set: {nome,  tipo, capacidade, taxa,tempo, energiaTotal, custoCiclo, eficiencia, preco, estoque, disponivel}
        })
        if(result.modifiedCount > 0){
            console.log(`Produto com o ID: ${id} atualizado com sucesso`)
            res.redirect('/admin')
        }else{
            res.status(404).send('Produto não encontrada')
        }
    }catch(err){
        console.error('Erro ao atualizar o produto: ', err)
        res.status(500).send('Erro ao atualizar o produto. Por favor tente novamente mais tarde.')
    }finally{
        client.close()
    }
})

app.get('/admin/produto/:id', protegerAdmin, async (req,res)=>{
    const { id } = req.params
    const cliente = new MongoClient(urlMongo)

    try{
        await cliente.connect()
        const db = cliente.db(nomeBanco)
        const collection = db.collection(collectionProdutos)

        const manu = await collection.findOne({_id: new ObjectId(id)})

        if(!manu){
            return res.status(404).send('Produto não encontrado')
        }
        res.json(manu)
    }catch(err){
        console.error('Erro ao buscar o produto: ', err)
        res.status(500).send('Erro ao buscar o produto. Por favor tente novamente mais tarde')
    }finally{
        cliente.close()
    }
})

app.post('/admin/produtos_deletar', protegerAdmin, async(req,res)=>{
    const {id} = req.body
    const client = new MongoClient(urlMongo)

    try{
        await client.connect()
        const db = client.db(nomeBanco)
        const collection = db.collection(collectionProdutos)

        const result = await collection.deleteOne({_id: new ObjectId(id)})

        if(result.deletedCount > 0){
            console.log(`Produto com ID: ${id} deletado com sucesso`)
            res.redirect('/admin')
        }else{
            res.status(404).send('Produto não encontrado')
        }
    }catch(err){
        console.log('Erro ao deletar o produto:', err)
        res.status(500).send('Erro ao deletar o produto. Por favor tente novamente mais tarde')
    }finally{
        client.close()
    }
})

app.get('/admin/listar_produtos', protegerAdmin, async(req,res)=>{
    const cliente = new MongoClient(urlMongo)

    try{
        await cliente.connect()
        const db = cliente.db(nomeBanco)
        const collection = db.collection(collectionProdutos)

        const usuarios = await collection.find({}, {projection: {_id:1, nome:1, tipo:1, capacidade:1, taxa:1, tempo:1, energiaTotal:1, custoCiclo:1, eficiencia:1, preco:1, estoque:1, disponivel:1 }}).toArray()
        res.json(usuarios)
    }catch(err){
        console.error('Erro ao buscar produtos: ', err)
        res.status(500).send('Erro ao buscar produtos. Por favor tente novamente mais tarde.')
    }finally{
        cliente.close()
    }
})

//Crud de serviços dos administradores

app.get('/admin/servicos', protegerAdmin, (req,res) =>{
    res.sendFile(__dirname + '/views/admin/html/serviços.html')
})

app.get('/admin/servicos_cadastro', protegerAdmin, (req,res)=>{
    res.sendFile(__dirname + '/views/admin/html/servicos/cadastrar.html')
})

app.post('/admin/servicos_cadastro', protegerAdmin, async (req,res)=>{
   const novoServico = req.body
   const client = new MongoClient(urlMongo)

   try {
       await client.connect()
       const db = client.db(nomeBanco)
       const collection = db.collection(collectionServico)

       const result = await collection.insertOne(novoServico)
       console.log(`Serviço cadastrado com sucesso. ID: ${result.insertedId}`)
       res.redirect('/admin')
        
   }catch(err){
    console.error('Erro ao cadastrar o serviço: ', err)
    res.status(500).send('Erro ao cadastrar o serviço. Por favor tente mais tarde ')
   }finally{
    client.close()
   }
})

app.get('/admin/servicos_atualizar', protegerAdmin, async(req,res)=>{
    res.sendFile(__dirname + '/views/admin/html/servicos/atualizar.html')
})

app.post('/admin/servicos_atualizar', protegerAdmin, async (req, res) => {
  const { id, usuario, plano, tipoPagamento, custo, duracao, disponivel } = req.body;
  const client = new MongoClient(urlMongo);

  try {
    await client.connect();
    const db = client.db(nomeBanco);
    const collection = db.collection(collectionServico);

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          usuario,
          plano,
          tipoPagamento,
          custo: parseFloat(custo),
          duracao,
          disponivel
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Serviço com o ID: ${id} atualizado com sucesso`);
      res.redirect('/admin/servicos');
    } else {
      res.status(404).send('Serviço não encontrado');
    }
  } catch (err) {
    console.error('Erro ao atualizar o serviço: ', err);
    res.status(500).send('Erro ao atualizar o Serviço. Por favor tente novamente mais tarde.');
  } finally {
    client.close();
  }
});


app.get('/admin/servico/:id', protegerAdmin, async (req,res)=>{
    const { id } = req.params
    const cliente = new MongoClient(urlMongo)

    try{
        await cliente.connect()
        const db = cliente.db(nomeBanco)
        const collection = db.collection(collectionServico)

        const serviço = await collection.findOne({_id: new ObjectId(id)})

        if(!serviço){
            return res.status(404).send('Serviço não encontrado')
        }
        res.json(serviço)
    }catch(err){
        console.error('Erro ao buscar o serviço: ', err)
        res.status(500).send('Erro ao buscar o serviço. Por favor tente novamente mais tarde')
    }finally{
        cliente.close()
    }
})

app.post('/admin/servicos_deletar', protegerAdmin, async(req,res)=>{
    const {id} = req.body
    const client = new MongoClient(urlMongo)

    try{
        await client.connect()
        const db = client.db(nomeBanco)
        const collection = db.collection(collectionServico)

        const result = await collection.deleteOne({_id: new ObjectId(id)})

        if(result.deletedCount > 0){
            console.log(`Serviço com ID: ${id} deletado com sucesso`)
            res.redirect('/admin')
        }else{
            res.status(404).send('Serviço não encontrado')
        }
    }catch(err){
        console.log('Erro ao deletar o serviço:', err)
        res.status(500).send('Erro ao deletar o serviço. Por favor tente novamente mais tarde')
    }finally{
        client.close()
    }
})

app.get('/admin/listar_servicos', protegerAdmin, async (req, res) => {
  const cliente = new MongoClient(urlMongo);

  try {
    await cliente.connect();
    const db = cliente.db(nomeBanco);
    const collection = db.collection(collectionServico);

    const servicos = await collection.find({}, {
      projection: {
        _id: 1,
        usuario: 1,
        plano: 1,
        tipoPagamento: 1,
        custo: 1,
        duracao: 1,
        disponivel: 1
      }
    }).toArray();

    res.json(servicos);
  } catch (err) {
    console.error('Erro ao buscar serviços: ', err);
    res.status(500).send('Erro ao buscar serviços. Por favor tente novamente mais tarde.');
  } finally {
    cliente.close();
  }
});

//Crud de manutenções para administradores

app.get('/admin/manutencoes', protegerAdmin, (req,res) =>{
    res.sendFile(__dirname + '/views/admin/html/manutencoes.html')
})

app.get('/admin/manutencoes_cadastro', protegerAdmin, (req,res)=>{
    res.sendFile(__dirname + '/views/admin/html/manutencao/cadastrar.html')
})

app.post('/admin/manutencoes_cadastro', protegerAdmin, async (req,res)=>{
   const novaManu = req.body
   const client = new MongoClient(urlMongo)

   try {
       await client.connect()
       const db = client.db(nomeBanco)
       const collection = db.collection(collectionManu)

       const result = await collection.insertOne(novaManu)
       console.log(`Manutenção cadastrada com sucesso. ID: ${result.insertedId}`)
       res.redirect('/admin')
        
   }catch(err){
    console.error('Erro ao cadastrar a manutenção: ', err)
    res.status(500).send('Erro ao cadastrar a manutenção. Por favor tente mais tarde ')
   }finally{
    client.close()
   }
})

app.get('/admin/manutencoes_atualizar', protegerAdmin, async(req,res)=>{
    res.sendFile(__dirname + '/views/admin/html/manutencao/atualizar.html')
})

app.post('/admin/manutencoes_atualizar', protegerAdmin, async(req,res)=>{
    const { id, usuario, tipo, custoHora, custoTotal, dias, disponivel } = req.body
    const client = new MongoClient(urlMongo)

    try {
        await client.connect()
        const db = client.db(nomeBanco)
        const collection = db.collection(collectionManu)
        const result = await collection.updateOne({ _id: new ObjectId(id)},{
            $set: {usuario,  tipo, custoHora, custoTotal, dias, disponivel}
        })
        if(result.modifiedCount > 0){
            console.log(`Manutenção com o ID: ${id} atualizado com sucesso`)
            res.redirect('/admin')
        }else{
            res.status(404).send('Manutenção não encontrada')
        }
    }catch(err){
        console.error('Erro ao atualizar a manutenção: ', err)
        res.status(500).send('Erro ao atualizar a manutenção. Por favor tente novamente mais tarde.')
    }finally{
        client.close()
    }
})

app.get('/admin/manutencao/:id', protegerAdmin, async (req,res)=>{
    const { id } = req.params
    const cliente = new MongoClient(urlMongo)

    try{
        await cliente.connect()
        const db = cliente.db(nomeBanco)
        const collection = db.collection(collectionManu)

        const manu = await collection.findOne({_id: new ObjectId(id)})

        if(!manu){
            return res.status(404).send('Manutenção não encontrado')
        }
        res.json(manu)
    }catch(err){
        console.error('Erro ao buscar a manutenção: ', err)
        res.status(500).send('Erro ao buscar a manutenção. Por favor tente novamente mais tarde')
    }finally{
        cliente.close()
    }
})

app.post('/admin/manutencoes_deletar', protegerAdmin, async(req,res)=>{
    const {id} = req.body
    const client = new MongoClient(urlMongo)

    try{
        await client.connect()
        const db = client.db(nomeBanco)
        const collection = db.collection(collectionManu)

        const result = await collection.deleteOne({_id: new ObjectId(id)})

        if(result.deletedCount > 0){
            console.log(`Manutenção com ID: ${id} deletado com sucesso`)
            res.redirect('/admin')
        }else{
            res.status(404).send('Manutenção não encontrada')
        }
    }catch(err){
        console.log('Erro ao deletar a manutenção:', err)
        res.status(500).send('Erro ao deletar a manutenção. Por favor tente novamente mais tarde')
    }finally{
        client.close()
    }
})

app.get('/admin/listar_manutencoes', protegerAdmin, async(req,res)=>{
    const cliente = new MongoClient(urlMongo)

    try{
        await cliente.connect()
        const db = cliente.db(nomeBanco)
        const collection = db.collection(collectionManu)

        const usuarios = await collection.find({}, {projection: {_id:1, usuario:1, tipo:1, custoHora:1, custoTotal:1, dias:1, disponivel:1 }}).toArray()
        res.json(usuarios)
    }catch(err){
        console.error('Erro ao buscar manutenções: ', err)
        res.status(500).send('Erro ao buscar manutenções. Por favor tente novamente mais tarde.')
    }finally{
        cliente.close()
    }
})

app.get('/admin/dropdown-usuarios', protegerAdmin, async (req, res) => {
  const client = new MongoClient(urlMongo)
  try {
    await client.connect()
    const db = client.db(nomeBanco)
    const collection = db.collection(collectionName)

    const usuarios = await collection.find({}, { projection: { _id: 1, usuario: 1 } }).toArray()
    res.json(usuarios)
  } catch (err) {
    console.error('Erro ao buscar usuários: ', err)
    res.status(500).send('Erro ao buscar usuários')
  } finally {
    client.close()
  }
})

app.listen(porta, ()=>{
    console.log(`Servidor rodando na porta ${porta}`)
})
