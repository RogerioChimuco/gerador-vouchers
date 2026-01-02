# 🤝 Guia de Contribuição

Obrigado pelo interesse em contribuir para o Gerador de Vouchers! Este documento fornece diretrizes para contribuir com o projeto.

## 📋 Código de Conduta

Ao participar neste projeto, espera-se que mantenha um ambiente respeitoso e colaborativo. Por favor:

- Seja respeitoso e inclusivo
- Aceite críticas construtivas
- Foque no que é melhor para a comunidade
- Mostre empatia com outros contribuidores

## 🚀 Como Contribuir

### Reportar Bugs

1. Verifique se o bug já não foi reportado nas [Issues](../../issues)
2. Se não encontrar, [abra uma nova issue](../../issues/new)
3. Inclua:
   - Descrição clara do problema
   - Passos para reproduzir
   - Comportamento esperado vs atual
   - Screenshots (se aplicável)
   - Versão do Node.js e sistema operativo

### Sugerir Melhorias

1. [Abra uma issue](../../issues/new) com a tag `enhancement`
2. Descreva a melhoria proposta
3. Explique o benefício para os utilizadores

### Submeter Pull Requests

1. **Fork** o repositório
2. **Clone** o seu fork:
   ```bash
   git clone https://github.com/seu-usuario/gerador-vouchers.git
   ```
3. **Crie uma branch** para a sua feature:
   ```bash
   git checkout -b feature/nome-da-feature
   ```
4. **Faça as alterações** seguindo os padrões de código
5. **Teste** as alterações:
   ```bash
   npm start
   # Teste manualmente as funcionalidades afetadas
   ```
6. **Commit** com mensagens descritivas:
   ```bash
   git commit -m "feat: adiciona nova funcionalidade X"
   ```
7. **Push** para o seu fork:
   ```bash
   git push origin feature/nome-da-feature
   ```
8. **Abra um Pull Request** descrevendo as alterações

## 📝 Padrões de Código

### JavaScript

- Use ES6+ (arrow functions, template literals, etc.)
- Indentação: 4 espaços
- Strings: aspas simples `'texto'`
- Sempre use `const` ou `let`, nunca `var`
- Adicione comentários para lógica complexa

```javascript
// ✅ Bom
const processData = async (data) => {
    const result = await someAsyncOperation(data);
    return result;
};

// ❌ Evitar
var processData = function(data) {
    var result = someAsyncOperation(data);
    return result;
}
```

### Commits

Seguimos o padrão [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` nova funcionalidade
- `fix:` correção de bug
- `docs:` alterações na documentação
- `style:` formatação (não afeta lógica)
- `refactor:` refatoração de código
- `test:` adicionar ou corrigir testes
- `chore:` manutenção geral

**Exemplos:**
```
feat: adiciona suporte para templates A3
fix: corrige erro no parsing de CSV com caracteres especiais
docs: atualiza README com instruções de deploy
```

### Estrutura de Ficheiros

```
gerador-vouchers/
├── server.js          # Lógica principal (manter modular)
├── public/
│   ├── voucher_pdf/   # Templates (PDF apenas)
│   ├── convite_pdf/   # Convites (PDF apenas)
│   └── images/        # Imagens estáticas
└── docs/              # Documentação adicional
```

## 🧪 Testes

Antes de submeter um PR:

1. **Teste de Upload CSV:**
   - CSV com vírgula como separador
   - CSV com ponto-e-vírgula como separador
   - CSV com caracteres especiais (acentos)

2. **Teste de Templates:**
   - Template padrão (vouchers)
   - Modo etiqueta
   - Convites

3. **Teste de Download:**
   - Download pequeno (<1MB)
   - Download grande (>50MB)
   - Interrupção e retry

## 📚 Documentação

Ao adicionar novas funcionalidades:

1. Atualize o `README.md`
2. Atualize o `ARCHITECTURE.md` se necessário
3. Adicione comentários JSDoc para funções novas:

```javascript
/**
 * Processa um ficheiro CSV e retorna os dados parseados
 * @param {string} filePath - Caminho para o ficheiro CSV
 * @returns {Promise<Array>} Array de objetos com os dados
 */
async function processCSV(filePath) {
    // ...
}
```

## 🔍 Revisão de Código

Todos os PRs passam por revisão. Critérios:

- [ ] Código segue os padrões estabelecidos
- [ ] Funcionalidade testada manualmente
- [ ] Documentação atualizada (se aplicável)
- [ ] Sem warnings ou erros no console
- [ ] Performance adequada

## 📞 Contacto

- **Issues**: Para bugs e sugestões
- **Discussions**: Para dúvidas gerais

## 🙏 Agradecimentos

Obrigado por contribuir para melhorar o Gerador de Vouchers!

---

Feito com ❤️ pela comunidade
