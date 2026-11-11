import sys
import uuid
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from watch_service import WatchService, meaningful_change, snapshot

class WatchTests(unittest.TestCase):
    def setUp(self):
        self.test_root=Path(__file__).resolve().parents[1]/'.gather'/'test-runs'
        self.test_root.mkdir(parents=True,exist_ok=True)
        self.run_dir=self.test_root/str(uuid.uuid4());self.run_dir.mkdir()
        self.path=self.run_dir/'state.json'
        self.content={'title':'Model updates','description':'News about our video model.','text':'The current video model supports short clips with standard quality settings.'}
        self.service=WatchService(self.path,lambda url:dict(self.content))
        with patch('watch_service.threading.Thread'):
            self.service.create({'url':'https://example.com/models','keywords':'video model','interval':60})
        self.watch_id=self.service.state['watches'][0]['id']

    def tearDown(self):
        self.assertTrue(self.run_dir.resolve().is_relative_to(self.test_root.resolve()))
        for name in ('state.json','state.tmp'):
            path=self.run_dir/name
            if path.exists():path.unlink()
        self.run_dir.rmdir()

    def test_first_check_and_unchanged_content_stay_quiet(self):
        self.service.check(self.watch_id);self.service.check(self.watch_id)
        self.assertEqual(self.service.public()['updates'],[])
        self.assertIsNotNone(self.service.public()['watches'][0]['lastChecked'])
        self.assertNotIn('baseline',self.service.public()['watches'][0])

    def test_relevant_changes_notify_once_and_survive_restart(self):
        self.service.check(self.watch_id)
        self.content['text']+=' A new video model release now generates higher resolution clips with improved motion consistency.'
        self.service.check(self.watch_id);self.service.check(self.watch_id)
        updates=self.service.public()['updates'];self.assertEqual(len(updates),1);self.assertIn('higher resolution',updates[0]['summary'])
        restarted=WatchService(self.path,lambda url:self.content);self.assertEqual(len(restarted.public()['updates']),1)
        restarted.action({'action':'read','id':updates[0]['id']});self.assertTrue(restarted.public()['updates'][0]['read'])

    def test_irrelevant_changes_and_small_noise_stay_quiet(self):
        before='Video model documentation. '+('Stable reference content and usage instructions. '*20)
        after=before+' Our office opening hours are now different during the winter holidays.'
        self.assertIsNone(meaningful_change(before,after,['pricing']))
        self.assertIsNone(meaningful_change('Current visitors 100','Current visitors 101',[]))

    def test_errors_preserve_baseline_and_recover_without_fake_updates(self):
        self.service.check(self.watch_id);baseline=self.service.state['watches'][0]['baseline']
        self.service.fetcher=lambda url:(_ for _ in ()).throw(ValueError('Site blocked access'))
        self.service.check(self.watch_id);watch=self.service.public()['watches'][0]
        self.assertIn('blocked',watch['lastError']);self.assertEqual(self.service.state['watches'][0]['baseline'],baseline);self.assertFalse(self.service.public()['updates'])

    def test_pause_resume_duplicate_and_remove(self):
        self.service.action({'action':'pause','id':self.watch_id});self.assertTrue(self.service.public()['watches'][0]['paused'])
        self.service.action({'action':'pause','id':self.watch_id});self.assertFalse(self.service.public()['watches'][0]['paused'])
        with self.assertRaises(ValueError):self.service.create({'url':'https://example.com/models'})
        self.service.action({'action':'delete','id':self.watch_id});self.assertFalse(self.service.public()['watches'])

    def test_login_pages_are_errors_not_content_changes(self):
        with self.assertRaises(ValueError):snapshot({'title':'Just a moment...','text':'Checking your browser'})

if __name__=='__main__':unittest.main()
