FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Install tsx for running typescript directly in ESM mode
RUN npm install -g tsx

EXPOSE 3004

CMD ["tsx", "index.ts"]
