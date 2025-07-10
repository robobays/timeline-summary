#!/bin/bash

# Start ollama serve as a daemon
nohup ollama serve > ollama-serve.log 2>&1 &

# Wait for ollama serve to be ready
until nc -z localhost 11434; do
  echo "Waiting for ollama serve..."
  sleep 1
done

# Pull llama3.1 model
ollama pull llama3.1

# Start the Node.js application
node ./index.js
