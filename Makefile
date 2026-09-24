.DEFAULT_GOAL := full
.PHONY: full lint test local-vben-antd-vue3

SCAFFOLD ?= scaffold
PROJECT ?= pc-admin
OUTPUT_DIR ?= ..
DEMOS_DIR ?= $(CURDIR)/../demos
UI ?= vben-antd-vue3
VITE_GLOB_API_URL ?= https://entry.go-cinch.top/api/auth
VITE_GLOB_AUTH_API_URL ?= https://entry.go-cinch.top/api/auth

ifeq ($(filter $(UI),vben-antd-vue3 vben),)
$(error UI must be vben-antd-vue3 or vben)
endif

full:
	$(SCAFFOLD) new "$(CURDIR)" --output-dir="$(OUTPUT_DIR)" \
		--run-hooks=always --no-prompt --preset=full \
		"Project=$(PROJECT)" "ui=$(UI)" \
		"VITE_GLOB_API_URL=$(VITE_GLOB_API_URL)" \
		"VITE_GLOB_AUTH_API_URL=$(VITE_GLOB_AUTH_API_URL)"

lint:
	$(SCAFFOLD) lint scaffold.yml

test: lint
	SCAFFOLD="$(SCAFFOLD)" python3 scripts/test-template.py

local-vben-antd-vue3:
	@set -eu; \
	project='vben-antd-vue3-pc-admin'; \
	target_dir="$(DEMOS_DIR)/$$project"; \
	env_file="$$target_dir/apps/web-antd/.env"; \
	test -d "$$target_dir"; \
	test -f "$$env_file"; \
	read_secure_key() { \
		awk ' \
			index($$0, "VITE_APP_STORE_SECURE_KEY=") == 1 { \
				print substr($$0, index($$0, "=") + 1); \
				matches++; \
			} \
			END { if (matches != 1) exit 1 } \
		' "$$1"; \
	}; \
	secure_key=$$(read_secure_key "$$env_file"); \
	if [ -z "$$secure_key" ]; then \
		printf 'VITE_APP_STORE_SECURE_KEY is empty in %s\n' "$$env_file" >&2; \
		exit 1; \
	fi; \
	work_dir=$$(mktemp -d "$${TMPDIR:-/tmp}/pc-admin-fe-layout.XXXXXX"); \
	staging_dir="$$work_dir/generated"; \
	env_backup="$$work_dir/web-antd.env"; \
	mkdir -p "$$staging_dir"; \
	cp -p "$$env_file" "$$env_backup"; \
	restore_state() { \
		status=$$?; \
		trap - EXIT INT TERM; \
		cp -p "$$env_backup" "$$env_file"; \
		restored_secure_key=$$(read_secure_key "$$env_file"); \
		if [ "$$restored_secure_key" != "$$secure_key" ]; then \
			printf 'failed to restore VITE_APP_STORE_SECURE_KEY in %s\n' "$$env_file" >&2; \
			status=1; \
		fi; \
		rm -rf "$$work_dir"; \
		exit "$$status"; \
	}; \
	trap restore_state EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(SCAFFOLD) new "$(CURDIR)" --output-dir="$$staging_dir" \
		--run-hooks=always --no-prompt --preset=vben-antd-vue3 \
		"Project=$$project" "ui=vben-antd-vue3" \
		"VITE_GLOB_API_URL=$(VITE_GLOB_API_URL)" \
		"VITE_GLOB_AUTH_API_URL=$(VITE_GLOB_AUTH_API_URL)"; \
	rsync -a --checksum \
		--exclude='.git/' \
		--exclude='.DS_Store' \
		--exclude='node_modules/' \
		--exclude='.pnpm-store/' \
		--exclude='dist/' \
		--exclude='.turbo/' \
		--exclude='.cache/' \
		"$$staging_dir/$$project/" \
		"$$target_dir/"; \
	test ! -e "$$target_dir/vben-antd-vue3"
