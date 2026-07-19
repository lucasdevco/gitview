.PHONY: build frontend test check clean

frontend:
	cd frontend && npm run build
	rm -rf internal/web/dist
	cp -R frontend/dist internal/web/dist
	printf '%s\n' 'keep embed dir for generated frontend assets' > internal/web/dist/.keep

build: frontend
	go build -o gitview ./cmd/gitview

test:
	go test ./...

check:
	go fmt ./...
	go vet ./...
	cd frontend && npm run check
	go test ./...

clean:
	rm -f gitview
	rm -rf frontend/dist internal/web/dist
	mkdir -p internal/web/dist
	printf '%s\n' 'keep embed dir for generated frontend assets' > internal/web/dist/.keep
