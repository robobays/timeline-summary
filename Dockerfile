FROM ollama/ollama

WORKDIR /app

COPY package.json .
RUN npm install --only=production

COPY index.js ./index.js
COPY prompt.txt ./prompt.txt

CMD [ "node", "./index.js" ]
