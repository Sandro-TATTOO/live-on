# Usar imagem oficial do Node.js
FROM node:18-alpine

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código da aplicação
COPY . .

# Expor porta da aplicação
EXPOSE 3000

# Comando para rodar a aplicação
CMD ["node", "server.js"]
