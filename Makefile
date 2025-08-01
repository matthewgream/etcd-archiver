
SYSTEM=etcd-archiver
TARGET=collector.js
INSTALL_FILES=periodic.js extractor.js selector.js
INSTALL_LIBS=

##

INSTALL_DIR=/opt/bin/$(SYSTEM)
NODE_MODULES_DIR=$(INSTALL_DIR)/node_modules

prettier:
	prettier --write *.js
lint:
	eslint *.js
test:
	node $(TARGET)
.PHONY: prettier lint test

##

SYSTEMD_DIR = /etc/systemd/system
define install_systemd_depend
	-systemctl disable $(1) 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1).service
	systemctl daemon-reload
	systemctl enable $(1)
endef
define install_systemd_service
	-systemctl stop $(1) 2>/dev/null || true
	-systemctl disable $(1) 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1).service
	systemctl daemon-reload
	systemctl enable $(1)
	systemctl start $(1) || echo "Warning: Failed to start $(1)"
endef
define install_systemd_timer
	-systemctl stop $(1).timer 2>/dev/null || true
	-systemctl disable $(1).timer 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1).service
	cp $(2).timer $(SYSTEMD_DIR)/$(1).timer
	systemctl daemon-reload
	systemctl enable $(1).timer
	systemctl start $(1).timer || echo "Warning: Failed to start $(1).timer"
endef

install_storage: storage.service
	$(call install_systemd_depend,$(SYSTEM)-storage,storage)
install_collector: collector.service
	$(call install_systemd_service,$(SYSTEM)-collector,collector)
install_periodic: periodic.service periodic.timer
	$(call install_systemd_timer,$(SYSTEM)-periodic,periodic)
install_default: default
	cp default /etc/default/$(SYSTEM)

install: install_storage install_collector install_periodic install_default
restart:
	-systemctl restart $(SYSTEM)-collector 2>/dev/null || true
	-systemctl restart $(SYSTEM)-periodic.timer 2>/dev/null || true
.PHONY: install_storage install_collector install_periodic install_default \
	install restart
