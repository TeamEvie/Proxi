FROM node:16-alpine
ENV NODE_ENV=production

WORKDIR /app

COPY ["package.json", "yarn.lock*", "./"]

RUN yarn

COPY . .

CMD [ "node", "index.mjs" ]
