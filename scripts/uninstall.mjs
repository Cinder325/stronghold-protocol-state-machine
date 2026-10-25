#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
import {runInstallerCli,installerCliFailure} from './install.mjs';
try{runInstallerCli('uninstall');}catch(error){installerCliFailure(error);}
