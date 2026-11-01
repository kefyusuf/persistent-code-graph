interface Box { height: number }
interface Box { width: number }
import { save as persist } from './storage';
function execute() { persist(); }
