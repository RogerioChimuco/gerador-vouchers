# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :x:                |

## Reporting a Vulnerability

Se descobrir uma vulnerabilidade de segurança, por favor:

1. **NÃO** abra uma issue pública
2. Envie um email para [security@example.com] com:
   - Descrição da vulnerabilidade
   - Passos para reproduzir
   - Impacto potencial
   - Sugestão de correção (se tiver)

### O que esperar

- Confirmação de recebimento em 48 horas
- Avaliação inicial em 7 dias
- Atualizações regulares sobre o progresso
- Crédito na divulgação (se desejar)

## Boas Práticas de Segurança

### Para Administradores

1. **Mantenha atualizado**: Use sempre a versão mais recente
2. **HTTPS**: Execute atrás de um proxy reverso com SSL
3. **Firewall**: Restrinja acesso à porta do servidor
4. **Autenticação**: Implemente autenticação para ambiente de produção
5. **Logs**: Monitore logs para atividades suspeitas

### Para Utilizadores

1. **CSVs confiáveis**: Apenas faça upload de ficheiros de fontes confiáveis
2. **Dados sensíveis**: Evite incluir dados pessoais nos CSVs
3. **Downloads**: Verifique a integridade dos PDFs gerados

## Medidas de Segurança Implementadas

- ✅ Sanitização de nomes de ficheiros
- ✅ Validação de input do CSV
- ✅ Headers de segurança HTTP
- ✅ Limpeza automática de ficheiros temporários
- ✅ CORS configurável

## Limitações Conhecidas

- O sistema não implementa autenticação por defeito
- Ficheiros temporários podem conter dados sensíveis
- Rate limiting não está implementado

## Recomendações para Produção

```nginx
# Exemplo de configuração Nginx
server {
    listen 443 ssl;
    server_name vouchers.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }
}
```
