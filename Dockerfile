FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]
