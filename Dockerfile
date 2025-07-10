FROM ollama/ollama

ENTRYPOINT []

RUN apt-get update -y && apt-get install netcat-openbsd nodejs npm -y

WORKDIR /app

COPY package.json .
RUN npm install --only=production

COPY go.sh ./go.sh
COPY index.js ./index.js
COPY prompt.txt ./prompt.txt

CMD ["bash", "./go.sh"]
