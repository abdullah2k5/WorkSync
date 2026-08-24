# WorkSync backend - minimal production image for Back4App Containers
FROM node:24-alpine

WORKDIR /app

# bcrypt (dependency) compiles from source on Alpine/Node 24,
# which requires python3, make and g++.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
