docker stop test-postgres
docker rm test-postgres
docker run -p 127.0.0.1:5432:5432 --name test-postgres -e POSTGRES_DB=tablevc_test -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password postgres:alpine
