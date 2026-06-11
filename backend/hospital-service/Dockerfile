FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# We'll use ts-node for now to keep it simple, or compile
RUN npm install -g ts-node typescript

EXPOSE 3001

CMD ["ts-node", "index.ts"]
