.DEFAULT_GOAL := full
.PHONY: full lint test local

SCAFFOLD ?= scaffold
PROJECT ?= pc-admin
OUTPUT_DIR ?= ..
DEMOS_DIR ?= $(CURDIR)/../demos
DEMO ?=
UI ?= $(if $(filter $(DEMO),tail-react art-eleplus-vue3 shadcn-react tdesign-vue3-mobile ant-design-mobile ant-design-mini tdesign-mini wot-ui-mini),$(DEMO),vben-antd-vue3)
AUTH_PROXY_TARGET ?= http://127.0.0.1:8081
TAIL_REACT_PORT ?= 5667
ART_ELEPLUS_VUE3_PORT ?= 5668
SHADCN_REACT_PORT ?= 5669
VITE_GLOB_API_URL ?= https://entry.go-cinch.top/api/auth
VITE_GLOB_AUTH_API_URL ?= https://entry.go-cinch.top/api/auth

ifeq ($(filter $(UI),vben-antd-vue3 vben tail-react tail art-eleplus-vue3 art shadcn-react shadcn tdesign-vue3-mobile tdesign-mobile ant-design-mobile antd-mobile ant-design-mini tdesign-mini wot-ui-mini),)
$(error UI must be vben-antd-vue3, tail-react, art-eleplus-vue3, shadcn-react, tdesign-vue3-mobile, ant-design-mobile, ant-design-mini, tdesign-mini, or wot-ui-mini (or a supported alias))
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

local:
	@set -eu; \
	project='$(DEMO)'; \
	case "$$project" in \
		''|.|..|*/*) \
			printf 'Usage: make local DEMO=<demos-subdirectory> [UI=<preset>]\n' >&2; \
			exit 2; \
			;; \
	esac; \
	target_dir="$(DEMOS_DIR)/$$project"; \
	selected_ui='$(UI)'; \
	case "$$selected_ui" in vben) selected_ui='vben-antd-vue3' ;; tail) selected_ui='tail-react' ;; art) selected_ui='art-eleplus-vue3' ;; shadcn) selected_ui='shadcn-react' ;; tdesign-mobile) selected_ui='tdesign-vue3-mobile' ;; antd-mobile) selected_ui='ant-design-mobile' ;; esac; \
	if [ "$$selected_ui" = 'vben-antd-vue3' ]; then \
		env_file="$$target_dir/apps/web-antd/.env"; \
	else \
		env_file="$$target_dir/.env.development.local"; \
	fi; \
	read_secure_key() { \
		awk ' \
			index($$0, "VITE_APP_STORE_SECURE_KEY=") == 1 { \
				print substr($$0, index($$0, "=") + 1); \
				matches++; \
			} \
			END { if (matches != 1) exit 1 } \
		' "$$1"; \
	}; \
	work_dir=$$(mktemp -d "$${TMPDIR:-/tmp}/pc-admin-fe-layout.XXXXXX"); \
	staging_dir="$$work_dir/generated"; \
	env_backup="$$work_dir/web-antd.env"; \
	mkdir -p "$$staging_dir"; \
	secure_key=''; \
	restore_state() { \
		status=$$?; \
		trap - EXIT INT TERM; \
		if [ -f "$$env_backup" ]; then \
			cp -p "$$env_backup" "$$env_file"; \
			restored_secure_key=$$(read_secure_key "$$env_file"); \
			if [ "$$restored_secure_key" != "$$secure_key" ]; then \
				printf 'failed to restore VITE_APP_STORE_SECURE_KEY in %s\n' "$$env_file" >&2; \
				status=1; \
			fi; \
		fi; \
		rm -rf "$$work_dir"; \
		exit "$$status"; \
	}; \
	trap restore_state EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	if [ -e "$$target_dir" ] && [ "$$selected_ui" = 'vben-antd-vue3' ]; then \
		test -d "$$target_dir"; \
		test -f "$$env_file"; \
		secure_key=$$(read_secure_key "$$env_file"); \
		if [ -z "$$secure_key" ]; then \
			printf 'VITE_APP_STORE_SECURE_KEY is empty in %s\n' "$$env_file" >&2; \
			exit 1; \
		fi; \
		cp -p "$$env_file" "$$env_backup"; \
	fi; \
	$(SCAFFOLD) new "$(CURDIR)" --output-dir="$$staging_dir" \
		--run-hooks=always --no-prompt --preset="$(UI)" \
		"Project=$$project" "ui=$(UI)" \
		"VITE_GLOB_API_URL=$(VITE_GLOB_API_URL)" \
		"VITE_GLOB_AUTH_API_URL=$(VITE_GLOB_AUTH_API_URL)"; \
	rsync -a --checksum --delete \
		--exclude='.git/' \
		--exclude='.DS_Store' \
		--exclude='node_modules/' \
		--exclude='.pnpm-store/' \
		--exclude='dist/' \
		--exclude='.turbo/' \
		--exclude='.cache/' \
		--exclude='*.local' \
		--exclude='project.private.config.json' \
		"$$staging_dir/$$project/" \
		"$$target_dir/"; \
	if [ "$$selected_ui" != 'vben-antd-vue3' ] && [ ! -e "$$env_file" ]; then \
		case "$$selected_ui" in \
			tail-react) local_port='$(TAIL_REACT_PORT)' ;; \
			art-eleplus-vue3) local_port='$(ART_ELEPLUS_VUE3_PORT)' ;; \
			shadcn-react) local_port='$(SHADCN_REACT_PORT)' ;; \
			tdesign-vue3-mobile|ant-design-mobile|ant-design-mini|tdesign-mini|wot-ui-mini) local_port=$$(python3 scripts/available-port.py "$(DEMOS_DIR)") ;; \
		esac; \
		if [ "$$selected_ui" = 'shadcn-react' ]; then \
			printf 'AUTH_PROXY_TARGET=%s\nPORT=%s\nNEXT_PUBLIC_APP_URL=http://localhost:%s\nNEXT_PUBLIC_SENTRY_DISABLED=true\n' '$(AUTH_PROXY_TARGET)' "$$local_port" "$$local_port" > "$$env_file"; \
		else \
			printf 'AUTH_PROXY_TARGET=%s\nVITE_PORT=%s\n__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=preview-local.go-cinch.top\n' '$(AUTH_PROXY_TARGET)' "$$local_port" > "$$env_file"; \
		fi; \
	fi; \
	case "$$selected_ui" in \
		ant-design-mini|tdesign-mini|wot-ui-mini) \
			if [ ! -f "$$target_dir/mini.config.local" ]; then \
				printf '{"appid":"touristappid","apiBase":"%s"}\n' '$(AUTH_PROXY_TARGET)' > "$$target_dir/mini.config.local"; \
			fi ;; \
	esac; \
	test ! -e "$$target_dir/$$selected_ui"
