import assert from 'node:assert/strict';
import test from 'node:test';
import { enrollmentFlow, type EnrollmentCatalog } from '../src/utils/enrollmentFlow';
import type { ClassJoinLookup } from '../src/services/classService';

const departments = ['BSIT','BSHM','BSCRIM','BSED','BEED'];
const catalog: EnrollmentCatalog = {
  departments:departments.map(code=>({code,name:code})),yearLevels:[1,2,3,4].map(id=>({id,label:`Year ${id}`})),
  profile:{department_code:'BSIT',year_level:4,section:'A'},verificationRequests:[],subjects:[],classes:[],
};
const lookup = {classroom:{id:'1',code:'FIXTURE',departmentCode:'BSIT',yearLevel:4,semester:1,subjectId:1,curriculumActive:true,enrollmentOpen:true},eligible:true,eligibilityMessage:null,enrollment:null,request:null} as ClassJoinLookup;
const args = {catalog,lookup,selection:{departmentCode:'BSIT',yearLevel:4},section:'A',semester:1,code:' fixture '};

test('unassigned profiles require a matching verified code before class COR submission',()=>{
  const unverified = {...catalog,profile:{department_code:null,year_level:null,section:null}};
  const flow=enrollmentFlow({...args,catalog:unverified,lookup:{...lookup,eligible:false,eligibilityMessage:'Academic verification required.'}});
  assert.equal(flow.mode,'academic-request');assert.equal(flow.canUpload,true);assert.match(flow.message,/officially enrolls/);
  assert.equal(enrollmentFlow({...args,catalog:unverified,lookup:null,code:''}).canUpload,false,'Join Class requires a code; independent academic verification remains in Settings.');
  for(const changed of [{selection:{departmentCode:'BSIT',yearLevel:3}},{selection:{departmentCode:'BSHM',yearLevel:4}},{semester:2},{code:'OTHER'},{lookup:{...lookup,classroom:{...lookup.classroom,curriculumActive:false}}}])assert.equal(enrollmentFlow({...args,catalog:unverified,...changed}).canUpload,false);
});

test('pending academic COR attachments bind to the existing declaration and preserve an already saved COR',()=>{
  const pending={id:1,status:'pending',department_code:'BSIT',year_level:4,section:'A',cor_file_name:null};
  const unverified={...catalog,profile:{department_code:null,year_level:null,section:null},verificationRequests:[pending]};
  assert.equal(enrollmentFlow({...args,catalog:unverified}).mode,'academic-attachment');
  assert.equal(enrollmentFlow({...args,catalog:unverified,section:'B'}).canUpload,false);
  assert.equal(enrollmentFlow({...args,catalog:unverified,selection:{departmentCode:'BSHM',yearLevel:4}}).canUpload,false);
  const saved={...unverified,verificationRequests:[{...pending,cor_file_name:'saved.png'}]};
  const flow=enrollmentFlow({...args,catalog:saved});
  assert.equal(flow.mode,'academic-pending');assert.equal(flow.canUpload,false);assert.match(flow.message,/COR is saved/);
  assert.equal(enrollmentFlow({...args,catalog:saved,selection:{departmentCode:'',yearLevel:0}}).canUpload,false);
});

test('class COR upload requires matching verified profile, current code and selected semester',()=>{
  assert.equal(enrollmentFlow(args).mode,'class-request');
  for(const changed of [{lookup:null},{code:'OTHER'},{selection:{departmentCode:'BSIT',yearLevel:3}},{selection:{departmentCode:'BEED',yearLevel:4}},{catalog:null},{semester:3}])assert.equal(enrollmentFlow({...args,...changed}).canUpload,false);
  const wrongSemester=enrollmentFlow({...args,lookup:{...lookup,classroom:{...lookup.classroom,semester:2}}});
  assert.equal(wrongSemester.canUpload,false);assert.match(wrongSemester.message,/Second Semester/);
  assert.equal(enrollmentFlow({...args,semester:2,lookup:{...lookup,classroom:{...lookup.classroom,semester:2}}}).mode,'class-request');
});

test('closed, unmapped, pending and enrolled classes cannot accept another COR request',()=>{
  for(const message of ['Class closed','Curriculum not configured']){
    const flow=enrollmentFlow({...args,lookup:{...lookup,eligible:false,eligibilityMessage:message}});
    assert.equal(flow.canUpload,false);assert.equal(flow.message,message);
  }
  assert.equal(enrollmentFlow({...args,lookup:{...lookup,request:{id:'5',status:'pending',rejectionNote:null,submittedAt:'2026-10-24',reviewedAt:null}}}).canUpload,false);
  assert.equal(enrollmentFlow({...args,lookup:{...lookup,enrollment:{id:'5',joinedAt:'2026-10-24'}}}).canUpload,false);
  assert.equal(enrollmentFlow({...args,lookup:{...lookup,classroom:{...lookup.classroom,departmentCode:'BSHM'}}}).canUpload,false,'A stale eligible flag cannot override matching checks.');
});

test('all 40 official department/year/semester combinations permit eligible class COR submission',()=>{
  let count=0;
  for(const departmentCode of departments)for(const yearLevel of [1,2,3,4])for(const semester of [1,2]){
    const result=enrollmentFlow({...args,catalog:{...catalog,profile:{department_code:departmentCode,year_level:yearLevel,section:'A'}},selection:{departmentCode,yearLevel},semester,lookup:{...lookup,classroom:{...lookup.classroom,departmentCode,yearLevel,semester}}});
    assert.equal(result.mode,'class-request');assert.equal(result.canUpload,true);count++;
    const unverified=enrollmentFlow({...args,catalog:{...catalog,profile:{department_code:null,year_level:null,section:null}},selection:{departmentCode,yearLevel},semester,lookup:{...lookup,eligible:false,classroom:{...lookup.classroom,departmentCode,yearLevel,semester}}});
    assert.equal(unverified.mode,'academic-request');assert.equal(unverified.canUpload,true);
    for(const otherDepartment of departments)for(const otherYear of [1,2,3,4])for(const otherSemester of [1,2]) {
      if(otherDepartment===departmentCode&&otherYear===yearLevel&&otherSemester===semester)continue;
      const denied=enrollmentFlow({...args,catalog:{...catalog,profile:{department_code:null,year_level:null,section:null}},selection:{departmentCode:otherDepartment,yearLevel:otherYear},semester:otherSemester,lookup:{...lookup,classroom:{...lookup.classroom,departmentCode,yearLevel,semester}}});
      assert.equal(denied.canUpload,false,`${otherDepartment}/${otherYear}/${otherSemester} must not upload for ${departmentCode}/${yearLevel}/${semester}`);
    }
  }
  assert.equal(count,40);
});

test('an eligible class COR remains available during compatible section verification',()=>{
  const pending={id:3,status:'pending',department_code:'BSIT',year_level:4,section:'B',cor_file_name:'academic-evidence.png'};
  const data={...catalog,verificationRequests:[pending]};
  assert.equal(enrollmentFlow({...args,catalog:data,section:'B'}).mode,'class-request');
  assert.equal(enrollmentFlow({...args,catalog:data,section:'C'}).canUpload,false);
});
