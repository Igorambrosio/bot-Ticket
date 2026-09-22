require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const api = axios.create({
    baseURL: `https://${process.env.FRESHDESK_DOMAIN}.freshdesk.com/api/v2`,
    headers: {
        'Authorization': `Basic ${Buffer.from(process.env.FRESHDESK_API_KEY + ':X').toString('base64')}`,
        'Content-Type': 'application/json'
    }
});

const LISTA_CC = [
    "rodrigo.felizardo@claro.com.br",
    "gilson.carlos@claro.com.br",
    "jorge.apolinario.terceiros@claro.com.br",
    "edgar.assuncao@claro.com.br",
    "horacio.barros@claro.com.br",
    "atendimento@gowifi.com.br"
];

// --- BUSCA FASE 1 (Bradesco Migrações Ticket.csv) ---
async function buscarFase1(alvo) {
    return new Promise((resolve) => {
        let encontrada = null;
        const alvoLimpo = String(alvo).replace(/\D/g, '').replace(/^0+/, '');
        const caminhoArquivo = 'Bradesco Migrações Ticket.csv';

        if (!fs.existsSync(caminhoArquivo)) return resolve(null);

        const stream = fs.createReadStream(caminhoArquivo, { encoding: 'utf8' })
            .pipe(csv({
                separator: ',',
                mapHeaders: ({ header }) => header ? header.replace(/^\ufeff/, '').trim() : header
            }))
            .on('data', (row) => {
                const juncaoRaw = row['JUNÇÃO SERVIÇO'] || row['JUNCAO SERVIÇO'] || row['JUNÇAO'] || row['JUNCAO'] || '';
                const juncaoCsv = String(juncaoRaw).replace(/\D/g, '').replace(/^0+/, '');

                if (juncaoCsv && juncaoCsv === alvoLimpo) {
                    encontrada = {
                        fase: 1,
                        juncao: String(juncaoRaw).trim(),
                        nome: row['NOME JUNÇÃO SERVIÇO'] || row['NOME JUNCAO SERVIÇO'] || row['NOME FANTASIA'] || 'N/A',
                        rua: row['ENDERECO-PONTA B'] || row['ENDEREÇO-PONTA B'] || row['Logradouro'] || '',
                        numero: row['NUMERO-PONTA B'] || row['NÚMERO-PONTA B'] || row['Número'] || row['Numero'] || 'S/N',
                        bairro: row['BAIRRO-PONTA B'] || row['Bairro'] || 'N/A',
                        cidade: row['LOCALIDADE-PONTA B'] || row['Cidade'] || '',
                        uf: row['ESTADO-PONTA B'] || row['UF'] || '',
                        cep: row['CEP-PONTA B'] || row['CEP'] || 'N/A'
                    };
                    stream.destroy();
                }
            })
            .on('end', () => resolve(encontrada))
            .on('error', (err) => {
                console.error("❌ Erro ao ler CSV Fase 1:", err);
                resolve(null);
            })
            .on('close', () => resolve(encontrada));
    });
}

// --- BUSCA FASE 2 (Bradesco_Fase_2.csv) ---
async function buscarFase2(alvo) {
    return new Promise((resolve) => {
        let encontrada = null;
        const alvoLimpo = String(alvo).replace(/\D/g, '').replace(/^0+/, '');
        const caminhoArquivo = 'Bradesco_Fase_2.csv';

        if (!fs.existsSync(caminhoArquivo)) return resolve(null);

        const stream = fs.createReadStream(caminhoArquivo, { encoding: 'utf8' })
            .pipe(csv({
                separator: ';', // Ajustado para ponto e vírgula
                mapHeaders: ({ header }) => header ? header.replace(/^\ufeff/, '').trim() : header
            }))
            .on('data', (row) => {
                const juncaoSimples = row['JUNÇAO'] || row['JUNCAO'] || '';
                const juncaoServico = row['JUNÇÃO SERVIÇO'] || row['JUNCAO SERVIÇO'] || '';
                
                const csv1 = String(juncaoSimples).replace(/\D/g, '').replace(/^0+/, '');
                const csv2 = String(juncaoServico).replace(/\D/g, '').replace(/^0+/, '');

                if ((csv1 && csv1 === alvoLimpo) || (csv2 && csv2 === alvoLimpo)) {
                    const tipoLog = row['Tipo Logradouro'] ? row['Tipo Logradouro'].trim() : '';
                    const log = row['Logradouro'] ? row['Logradouro'].trim() : '';
                    const ruaFormatada = tipoLog ? `${tipoLog} ${log}` : log;

                    encontrada = {
                        fase: 2,
                        juncao: juncaoSimples || juncaoServico || alvo,
                        nome: row['NOME FANTASIA'] ? row['NOME FANTASIA'].trim() : 'N/A',
                        endereco: `${ruaFormatada}, ${row['Número'] || row['Numero'] || 'S/N'} - ${row['Bairro'] || ''}, ${row['Cidade'] || ''} - ${row['UF'] || ''}`,
                        rua: ruaFormatada,
                        numero: row['Número'] || row['Numero'] ? (row['Número'] || row['Numero']).trim() : 'S/N',
                        bairro: row['Bairro'] ? row['Bairro'].trim() : 'N/A',
                        cidade: row['Cidade'] ? row['Cidade'].trim() : '',
                        uf: row['UF'] ? row['UF'].trim() : '',
                        cep: row['CEP'] ? row['CEP'].trim() : 'N/A'
                    };
                    stream.destroy();
                }
            })
            .on('end', () => resolve(encontrada))
            .on('error', (err) => {
                console.error("❌ Erro ao ler CSV Fase 2:", err);
                resolve(null);
            })
            .on('close', () => resolve(encontrada));
    });
}

async function buscarNoCsv(juncaoAlvo) {
    const alvo = String(juncaoAlvo).trim();
    
    let dados = await buscarFase1(alvo);
    if (!dados) {
        dados = await buscarFase2(alvo);
    }
    
    return dados;
}

// ---------------- COMANDO /bradesco (REMOTO) ----------------
bot.command('bradesco', async (ctx) => {
    const msg = ctx.message.text.trim().split(/\s+/);
    if (msg.length < 2) return ctx.reply('⚠️ Use: /bradesco [Junção]');

    const juncao = msg[1];
    ctx.reply(`⏳ Criando ticket para: ${juncao}...`);

    try {
        const dados = await buscarNoCsv(juncao);
        if (!dados) return ctx.reply(`❌ Junção ${juncao} não encontrada nas planilhas.`);

        const payload = {
            subject: `Bradesco Migração - REMOTO - Agência: ${juncao} - ${dados.nome}`,
            email: "diego.novais@claro.com.br",
            cc_emails: LISTA_CC,
            priority: 1, 
            status: 3, 
            type: "BRADESCO MIGRADO",
            group_id: 47000659864,
            description: `Abaixo dados do Atendimento remoto - Bradesco Migração - Agência: ${juncao}<br><br> Endereço: ${dados.rua}, ${dados.numero}, ${dados.cidade}, ${dados.uf}<br>`,
            custom_fields: {
                cf_tipo_de_atendimento: "Remoto",
                cf_localidade: String(dados.juncao),
                cf_ocorreu_sada_no_estoque: false, 
                cf_se_ocorreu_sada_estoque_informar_o_id: "ñ",
                cf_ticket_interno_clienteoperadora: "ñ"
            }
        };

        const res = await api.post('/tickets', payload);
        ctx.reply(`✅ Ticket REMOTO #${res.data.id} criado!\n📍 Agência: ${juncao} - ${dados.nome}\n🔗 https://${process.env.FRESHDESK_DOMAIN}.freshdesk.com/a/tickets/${res.data.id}`);
    } catch (error) {
        console.error("❌ Erro /bradesco:", error.response?.data || error.message);
        ctx.reply(`❌ Erro Freshdesk: ${JSON.stringify(error.response?.data?.errors || error.message)}`);
    }
});

// ---------------- COMANDO /fase2 (CAMPO) ----------------
bot.command('fase2', async (ctx) => {
    const msg = ctx.message.text.trim().split(/\s+/);
    if (msg.length < 2) return ctx.reply('⚠️ Use: /fase2 [Junção]');

    const juncao = msg[1];
    ctx.reply(`⏳ Criando ticket FASE 2 para: ${juncao}...`);

    try {
        let dados = await buscarFase2(juncao);
        if (!dados) {
            dados = await buscarNoCsv(juncao);
        }

        if (!dados) return ctx.reply(`❌ Junção ${juncao} não encontrada nas planilhas.`);

        const descriptionHtml = `Abaixo dados para Bradesco Fase 2 - CAMPO - Agência: ${juncao}<br>` +
            `Endereço: ${dados.rua}, ${dados.numero}, ${dados.cidade}, ${dados.uf}<br>` +
            `Técnico GOWIFI<br><br>` +
            `<b>Cliente:</b> BRADESCO - Fase 2<br>` +
            `<b>Localidade:</b> ${dados.juncao} - ${dados.nome}<br>` +
            `<b>Serviço:</b> INSTALAÇÃO<br>` +
            `<b>Operadora:</b> CLARO EMPRESAS<br>` +
            `<b>Endereço:</b> ${dados.rua}, ${dados.numero}<br>` +
            `<b>Bairro:</b> ${dados.bairro}<br>` +
            `<b>Cidade:</b> ${dados.cidade}<br>` +
            `<b>UF:</b> ${dados.uf}<br>` +
            `<b>CEP:</b> ${dados.cep}<br>` +
            `<b>DATA/HORA:</b><br>` +
            `<b>Ticket:</b> <br>` +
            `<b>OBS:</b> Levar notebook, 4g, patch cords (para testar o link), ferramentas (chave de fenda/Philips, buchas e parafusos), escada.<br>` +
            `<b>Equipamentos a serem instalados:</b> Roteador Mikrotik no Rack do Projeto / Antena Unifi na área de atendimento a clientes<br>` +
            `<b>CONTATO:</b> GER. ADM`;

        const payload = {
            subject: `Bradesco Fase 2 - Agência: ${juncao} - ${dados.nome}`,
            email: "diego.novais@claro.com.br",
            cc_emails: LISTA_CC,
            priority: 1, 
            status: 3, 
            type: "BRADESCO",
            group_id: 47000659864,
            description: descriptionHtml,
            custom_fields: {
                cf_tipo_de_atendimento: "Campo",
                cf_localidade: String(dados.juncao),
                cf_ocorreu_sada_no_estoque: false, 
                cf_se_ocorreu_sada_estoque_informar_o_id: "ñ",
                cf_ticket_interno_clienteoperadora: "ñ"
            }
        };

        const res = await api.post('/tickets', payload);
        ctx.reply(`✅ Ticket FASE 2 #${res.data.id} criado!\n📍 Agência: ${juncao} - ${dados.nome}\n🔗 https://${process.env.FRESHDESK_DOMAIN}.freshdesk.com/a/tickets/${res.data.id}`);
    } catch (error) {
        console.error("❌ Erro /fase2:", error.response?.data || error.message);
        ctx.reply(`❌ Erro Freshdesk: ${JSON.stringify(error.response?.data?.errors || error.message)}`);
    }
});

// ---------------- COMANDO /campo (CAMPO) ----------------
bot.command('campo', async (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/);
    if (args.length < 2) return ctx.reply('⚠️ Use: /campo [Junção]');

    const juncao = args[1];
    console.log(`\n🔍 [LOG] Buscando dados para /campo na junção: "${juncao}"...`);
    
    ctx.reply(`⏳ Criando ticket de CAMPO para: ${juncao}...`);

    try {
        const dados = await buscarNoCsv(juncao);
        
        if (!dados) {
            console.log(`❌ [LOG] Junção ${juncao} NÃO foi encontrada em nenhuma planilha.`);
            return ctx.reply(`❌ Junção ${juncao} não encontrada nas planilhas.`);
        }

        console.log(`✅ [LOG] Dados encontrados na Fase ${dados.fase}:`, dados);

        const bairro = dados.bairro ? dados.bairro : 'N/A';
        const cep = dados.cep ? dados.cep : 'N/A';

        const descriptionHtml = `Abaixo dados para Bradesco Migração - CAMPO - Agência: ${dados.juncao}<br>` +
            `Endereço: ${dados.rua}, ${dados.numero}, ${dados.cidade}, ${dados.uf}<br>` +
            `Técnico GOWIFI<br><br>` +
            `<b>Cliente:</b> BRADESCO MIGRADO<br>` +
            `<b>Localidade:</b> ${dados.juncao} - ${dados.nome}<br>` +
            `<b>Serviço:</b> INSTALAÇÃO<br>` +
            `<b>Operadora:</b> CLARO EMPRESAS<br>` +
            `<b>Endereço:</b> ${dados.rua}, ${dados.numero}<br>` +
            `<b>Bairro:</b> ${bairro}<br>` + 
            `<b>Cidade:</b> ${dados.cidade}<br>` +
            `<b>UF:</b> ${dados.uf}<br>` +
            `<b>CEP:</b> ${cep}<br>` +
            `<b>DATA/HORA:</b><br>` + 
            `<b>Ticket:</b> <br>` +
            `<b>OBS:</b> Levar notebook, 4g, patch cords (para testar o link), ferramentas (chave de fenda/Philips, buchas e parafusos), escada.<br>` +
            `<b>Equipamentos a serem instalados:</b> Roteador Mikrotik no Rack do Projeto / Antena Unifi na área de atendimento a clientes<br>` +
            `<b>CONTATO:</b> GER. ADM`;

        const payload = {
            subject: `Bradesco Migração - CAMPO - Agência: ${dados.juncao} - ${dados.nome}`,
            email: "diego.novais@claro.com.br",
            cc_emails: LISTA_CC,
            priority: 1, 
            status: 3, 
            type: "BRADESCO MIGRADO",
            group_id: 47000659864,
            description: descriptionHtml,
            custom_fields: { 
                cf_tipo_de_atendimento: "Campo", 
                cf_localidade: String(dados.juncao),
                cf_ocorreu_sada_no_estoque: false, 
                cf_se_ocorreu_sada_estoque_informar_o_id: "ñ",
                cf_ticket_interno_clienteoperadora: "ñ"
            }
        };

        const res = await api.post('/tickets', payload);
        console.log(`🚀 [LOG] Ticket criado com sucesso! ID: ${res.data.id}`);
        ctx.reply(`✅ TICKET DE CAMPO #${res.data.id} criado!\n📍 Agência: ${dados.juncao} - ${dados.nome}\n🔗 https://${process.env.FRESHDESK_DOMAIN}.freshdesk.com/a/tickets/${res.data.id}`);
    } catch (error) {
        console.error("❌ [LOG ERRO /campo]:", error.response?.data || error.message);
        ctx.reply(`❌ Erro Freshdesk: ${JSON.stringify(error.response?.data?.errors || error.message)}`);
    }
});

bot.launch().then(() => console.log('🤖 Bot Online!'));