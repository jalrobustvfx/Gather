import json
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backup_service import BackupService


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1] / '.gather' / 'test-runs'
        self.run_dir = self.root / str(uuid.uuid4())
        self.run_dir.mkdir(parents=True)
        self.destination = self.run_dir / 'chosen-folder'
        self.destination.mkdir()
        self.now = 1000000
        self.service = BackupService(self.run_dir / 'backup-state.json', clock=lambda: self.now)
        self.library_id = str(uuid.uuid4())
        self.data = {'version': 1, 'items': [{'id': 'one', 'url': 'https://example.com',
                     'screenshot': 'data:image/jpeg;base64,aGVsbG8=', 'topic': 'Video models'}],
                     'boards': [{'id': 'board', 'cards': [{'itemId': 'one', 'x': 40}]}],
                     'workflows': [{'id': 'workflow', 'nodes': [{'itemId': 'one'}], 'edges': []}],
                     'canvas': {'one': {'x': 20, 'y': 10}}}

    def tearDown(self):
        self.assertTrue(self.run_dir.resolve().is_relative_to(self.root.resolve()))
        # Only remove fixtures inside the verified, uniquely created test directory.
        for path in sorted(self.run_dir.rglob('*'), key=lambda p: len(p.parts), reverse=True):
            if path.is_file(): path.unlink()
            else: path.rmdir()
        self.run_dir.rmdir()

    def stage(self, library_id=None, extension=False):
        return self.service.stage({'id': library_id or self.library_id, 'extension': extension, 'data': self.data})

    def test_no_backup_until_folder_chosen_and_library_connected(self):
        self.service.tick()
        self.assertEqual(list(self.destination.iterdir()), [])
        with self.assertRaisesRegex(ValueError, 'folder'): self.service.run()
        self.service.configure(folder=self.destination)
        with self.assertRaisesRegex(ValueError, 'Connect'): self.service.run()

    def test_manual_backup_keeps_all_fields_and_separates_collections(self):
        self.stage()
        self.stage(str(uuid.uuid4()), extension=True)
        self.service.configure(folder=self.destination)
        result = self.service.run()
        folder = Path(result['lastFolder'])
        manifest = json.loads((folder / 'backup.json').read_text())
        self.assertEqual(len(manifest['collections']), 2)
        self.assertEqual({entry['label'] for entry in manifest['collections']}, {'Browser collection', 'Chrome extension'})
        restored = json.loads((folder / ('browser-' + self.library_id + '.json')).read_text())
        for key in self.data: self.assertEqual(restored[key], self.data[key])
        self.assertNotIn('data', result['libraries'][0])

    def test_twice_daily_schedule_persists_and_catches_up_once(self):
        self.stage()
        self.service.configure(folder=self.destination)
        self.now += self.service.interval - 1
        self.service.tick()
        self.assertIsNone(self.service.public()['lastBackup'])
        self.now += 1
        self.service.tick()
        self.assertEqual(len(list(self.destination.iterdir())), 1)
        self.now += self.service.interval * 3
        restarted = BackupService(self.service.path, clock=lambda: self.now)
        restarted.tick(); restarted.tick()
        self.assertEqual(len(list(self.destination.iterdir())), 2)
        self.assertEqual(restarted.public()['nextBackup'], self.now + self.service.interval)

    def test_pause_preserves_manual_backups_and_existing_files(self):
        self.stage(); self.service.configure(folder=self.destination, enabled=False)
        self.now += self.service.interval * 2
        self.service.tick()
        self.assertFalse(list(self.destination.iterdir()))
        first = self.service.run()['lastFolder']
        second = self.service.run()['lastFolder']
        self.assertNotEqual(first, second)
        self.assertTrue(Path(first).is_dir())

    def test_missing_drive_reports_error_and_recovers(self):
        self.stage(); self.service.configure(folder=self.destination)
        self.destination.rmdir(); self.now += self.service.interval
        with self.assertRaises(ValueError): self.service.tick()
        self.assertIn('unavailable', self.service.public()['lastError'])
        self.destination.mkdir(); self.service.tick()
        self.assertFalse(self.service.public()['lastError'])

    def test_failed_write_never_claims_a_successful_backup(self):
        self.stage(); self.service.configure(folder=self.destination)
        original = Path.write_text
        def failing(path, *args, **kwargs):
            if path.name.startswith('browser-'): raise OSError('Drive is full')
            return original(path, *args, **kwargs)
        with patch.object(Path, 'write_text', failing):
            with self.assertRaisesRegex(ValueError, 'Drive is full'): self.service.run()
        self.assertIsNone(self.service.public()['lastBackup'])
        self.assertFalse(list(self.destination.rglob('backup.json')))

    def test_rejects_invalid_library_and_keeps_staged_copy_durable(self):
        with self.assertRaises(ValueError): self.service.stage({'id': '../../escape', 'data': self.data})
        self.stage()
        self.data['items'].clear()
        restarted = BackupService(self.service.path)
        self.assertEqual(restarted.public()['libraries'][0]['items'], 1)

    def test_watch_baselines_and_updates_are_included(self):
        import threading
        class Watches:
            lock = threading.RLock()
            state = {'watches': [{'baseline': 'original content'}], 'updates': [{'read': True}]}
        self.service.watches = Watches()
        self.stage(); self.service.configure(folder=self.destination)
        folder = Path(self.service.run()['lastFolder'])
        self.assertEqual(json.loads((folder / 'watch-state.json').read_text()), Watches.state)

    def test_manual_backup_does_not_postpone_the_automatic_schedule(self):
        self.stage(); self.service.configure(folder=self.destination)
        expected = self.service.public()['nextBackup']
        self.now += 60
        self.service.run()
        self.assertEqual(self.service.public()['nextBackup'], expected)

    def test_native_folder_picker_selects_a_folder_and_cancel_keeps_it(self):
        def immediate_thread(**kwargs):
            class Immediate:
                def start(self): kwargs['target']()
            return Immediate()
        with patch('backup_service.threading.Thread', side_effect=immediate_thread), patch('tkinter.Tk') as root, patch('tkinter.filedialog.askdirectory', return_value=str(self.destination)) as choose:
            result = self.service.choose_folder()
            self.assertEqual(result['folder'], str(self.destination.resolve()))

            self.assertEqual(result['picker']['status'], 'selected')
            root.return_value.withdraw.assert_called_once()
            choose.assert_called_once()
        with patch('backup_service.threading.Thread', side_effect=immediate_thread), patch('tkinter.Tk'), patch('tkinter.filedialog.askdirectory', return_value=''):
            result = self.service.choose_folder()
            self.assertEqual(result['picker']['status'], 'cancelled')
            self.assertEqual(result['folder'], str(self.destination.resolve()))


    def test_external_recovery_survives_a_fresh_server_and_retains_all_snapshot_data(self):
        self.stage(extension=True)
        restarted = BackupService(self.service.path)
        copies = restarted.recovery()['libraries']
        self.assertEqual(copies[0]['items'], 1)
        restored = restarted.restore(self.library_id)['data']
        self.assertEqual(restored, self.data)
        restored['items'].clear()
        self.assertEqual(restarted.recovery()['libraries'][0]['items'], 1)

if __name__ == '__main__': unittest.main()
